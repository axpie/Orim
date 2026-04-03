import axios from 'axios';

const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? '';
const API_BASE_URL = configuredApiBaseUrl.replace(/\/$/, '');

const client = axios.create({
  baseURL: API_BASE_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('orim_user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/shared/')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
export { API_BASE_URL };
