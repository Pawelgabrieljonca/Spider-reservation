import { useEffect } from 'react';
import axios from 'axios';
import { keycloak } from './auth';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  if (keycloak?.authenticated) {
    try { await keycloak.updateToken(30); } catch (err) { console.warn('Nie udało się odświeżyć tokenu:', err); }
    if (keycloak.token) config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    if (status === 401 && keycloak?.authenticated && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await keycloak.updateToken(-1);
        if (keycloak.token) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${keycloak.token}`;
          return apiClient(originalRequest);
        }
      } catch {
        keycloak.login({ redirectUri: window.location.href });
      }
    }
    if (status === 401 || status === 403) console.warn(`Status ${status}: problem z autoryzacją lub uprawnieniami.`);
    return Promise.reject(error);
  }
);

export function extractApiError(err, fallback = 'Wystąpił błąd podczas komunikacji z serwerem.') {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  const buckets = data.errors?.json || data.errors?.query;
  if (buckets && typeof buckets === 'object') {
    for (const val of Object.values(buckets)) {
      if (Array.isArray(val) && val.length > 0) return String(val[0]);
      if (typeof val === 'string') return val;
    }
  }
  return fallback;
}

export function useRevalidate(callback, intervalMs = null, extraEvent = null) {
  useEffect(() => {
    const run = () => { if (document.visibilityState === 'visible') callback(); };
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    if (extraEvent) window.addEventListener(extraEvent, run);
    const id = intervalMs ? window.setInterval(run, intervalMs) : null;
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
      if (extraEvent) window.removeEventListener(extraEvent, run);
      if (id) window.clearInterval(id);
    };
  }, [callback, intervalMs, extraEvent]);
}

export default apiClient;
