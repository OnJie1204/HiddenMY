import axios from 'axios';
import { getToken, clearToken } from '@/utils/auth/tokenStorage';

const api = axios.create({
  baseURL: '/api',
});

// Automatically include the stored token with every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Only a real 401 (the token is genuinely invalid/expired) clears the session.
// Network blips, 5xx, Supabase timeouts etc. must NOT log the user out —
// otherwise a transient error on any request permanently signs them out.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && getToken()) {
      clearToken();
    }
    return Promise.reject(error);
  }
);

export default api;