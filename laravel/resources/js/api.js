import axios from 'axios';
import { getToken } from './utils/tokenStorage';

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

export default api;