import json
import unittest
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services import keycloak_admin_service
from app.schemas import PasswordResetRequestSchema

class _DummyResponse:
    def __init__(self, body: bytes = b""):
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

class TestAccountPasswordReset(unittest.TestCase):
    def setUp(self) -> None:
        keycloak_admin_service._clear_internal_caches()
        self._orig_secret = settings.KEYCLOAK_ADMIN_CLIENT_SECRET
        settings.KEYCLOAK_ADMIN_CLIENT_SECRET = "test-secret"

    def tearDown(self) -> None:
        settings.KEYCLOAK_ADMIN_CLIENT_SECRET = self._orig_secret
        keycloak_admin_service._clear_internal_caches()

    def test_redirect_path_validation_rejects_open_redirect(self) -> None:
        schema = PasswordResetRequestSchema()
        self.assertEqual(schema.load({"redirect_path": "/app/client/profile"})["redirect_path"], "/app/client/profile")
        with self.assertRaises(Exception):
            schema.load({"redirect_path": "https://evil.example/phish"})
        with self.assertRaises(Exception):
            schema.load({"redirect_path": "//evil.example"})

    def test_missing_secret_raises_503(self) -> None:
        settings.KEYCLOAK_ADMIN_CLIENT_SECRET = ""
        with self.assertRaises(keycloak_admin_service.KeycloakAdminNotConfiguredError) as ctx:
            keycloak_admin_service.send_password_reset_email("user-uuid-1")
        self.assertEqual(ctx.exception.http_status, 503)

    @patch("app.services.keycloak_admin_service.urllib.request.urlopen")
    def test_send_password_reset_email_and_rate_limit(self, mock_urlopen: MagicMock) -> None:
        token_body = json.dumps({"access_token": "svc-token-123", "expires_in": 300}).encode("utf-8")
        mock_urlopen.side_effect = [_DummyResponse(token_body), _DummyResponse(b"")]

        keycloak_admin_service.send_password_reset_email(
            "user-uuid-42",
            redirect_path="/app/instructor/profile",
            now=1000.0,
        )

        self.assertEqual(mock_urlopen.call_count, 2)
        action_req = mock_urlopen.call_args_list[1].args[0]
        self.assertEqual(action_req.get_method(), "PUT")
        self.assertIn("/users/user-uuid-42/execute-actions-email?", action_req.full_url)
        self.assertIn("redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapp%2Finstructor%2Fprofile", action_req.full_url)
        self.assertEqual(json.loads(action_req.data.decode("utf-8")), ["UPDATE_PASSWORD"])
        self.assertEqual(action_req.headers["Authorization"], "Bearer svc-token-123")

        with self.assertRaises(keycloak_admin_service.PasswordResetRateLimitedError) as ctx:
            keycloak_admin_service.send_password_reset_email("user-uuid-42", now=1010.0)
        self.assertEqual(ctx.exception.http_status, 429)

if __name__ == "__main__":
    unittest.main()
