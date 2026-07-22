import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Automatically include the stored token with every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;