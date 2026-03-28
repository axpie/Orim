import axios from 'axios';

const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? '';
const API_BASE_URL = (configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:61968' : '')).replace(/\/$/, '');

const client = axios.create({
  baseURL: API_BASE_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('orim_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('orim_token');
      localStorage.removeItem('orim_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
export { API_BASE_URL };
