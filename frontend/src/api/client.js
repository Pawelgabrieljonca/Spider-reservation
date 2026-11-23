import axios from 'axios';
import keycloak from '../auth/keycloak';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    if (keycloak && keycloak.authenticated) {
      try {
        await keycloak.updateToken(30);
      } catch (err) {
        console.warn('Nie udało się odświeżyć tokenu przed zapytaniem:', err);
      }
      if (keycloak.token) {
        config.headers.Authorization = `Bearer ${keycloak.token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;
      if (status === 401) {
        console.warn('Status 401: Brak autoryzacji lub wygasła sesja.');
      } else if (status === 403) {
        console.warn('Status 403: Brak uprawnień do zasobu.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
