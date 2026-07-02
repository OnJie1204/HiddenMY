import { useState } from 'react';
import api from './api';

function Register({ onRegisterSuccess }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', password_confirmation: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/register', form);
      localStorage.setItem('token', res.data.token);
      onRegisterSuccess(res.data.user);
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(', ') : 'Registration failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 300 }}>
      <h2>Register</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input name="name" placeholder="Name" onChange={handleChange} required
        style={{ display: 'block', marginBottom: 10, width: '100%' }} />
      <input name="email" type="email" placeholder="Email" onChange={handleChange} required
        style={{ display: 'block', marginBottom: 10, width: '100%' }} />
      <input name="password" type="password" placeholder="Password" onChange={handleChange} required
        style={{ display: 'block', marginBottom: 10, width: '100%' }} />
      <input name="password_confirmation" type="password" placeholder="Confrim Password" onChange={handleChange} required
        style={{ display: 'block', marginBottom: 10, width: '100%' }} />
      <button type="submit">Register</button>
    </form>
  );
}

export default Register;