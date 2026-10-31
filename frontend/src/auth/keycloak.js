import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'spider-climbing',
  clientId: 'spider-frontend',
});

export default keycloak;
