import api from '../api';   // 注意这里的 '../api' 是指向 src/api.js 那个档案

export const register = (data) => api.post('/register', data);
export const login = (email, password) => api.post('/login', { email, password });
export const logout = () => api.post('/logout');
export const getMe = () => api.get('/me');
export const forgotPassword = (email) => api.post('/forgot-password', { email });
export const resetPassword = (data) => api.post('/reset-password', data);
export const updateProfile = (data) => api.put('/profile', data);
export const uploadAvatar = (file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return api.post('/profile/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const changePassword = (data) => api.post('/change-password', data);
export const verifyNewEmail = (token) => api.post('/verify-email', { token });
export const verifyEmail = (id, hash, params) => api.get(`/email/verify/${id}/${hash}${params}`);
export const resendVerification = (email) => api.post('/resend-verification', { email });
