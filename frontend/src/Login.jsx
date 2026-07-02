import { useState } from 'react';
import api from './api';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/login', { email, password });
      localStorage.setItem('token', res.data.token);
      onLoginSuccess(res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 300 }}>
      <h2>Login</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ display: 'block', marginBottom: 10, width: '100%' }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={{ display: 'block', marginBottom: 10, width: '100%' }}
      />
      <button type="submit">Login</button>
    </form>
  );
}

export default Login;