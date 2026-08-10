import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login } from '../api/auth';
import { setToken } from '../utils/tokenStorage';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [infoMessage] = useState(location.state?.message || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await login(email, password);
      setToken(res.data.token, rememberMe);
      onLoginSuccess(res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Welcome back</h2>
        <p className="subtitle">Log in to continue to HiddenMY</p>
        {infoMessage && <p className="msg-success">{infoMessage}</p>}
        {error && <p className="msg-error">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="form-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="form-input"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            id="rememberMe"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <label htmlFor="rememberMe" style={{ fontSize: '0.9rem', color: '#64748b' }}>
            Remember me
          </label>
        </div>
        <div className="auth-link-row" style={{ textAlign: 'right', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button type="submit" className="btn btn-primary">Login</button>
        <a href={`http://127.0.0.1:8000/api/auth/google/redirect?remember=${rememberMe}`} className="btn" style={{ background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', marginTop: '0.75rem', display: 'block', textAlign: 'center' }}>
          Continue with Google
        </a>
        <p className="auth-link-row">Don't have an account? <Link to="/register">Register</Link></p>
        <p className="auth-link-row"><Link to="/resend-verification">Didn't receive verification email?</Link></p>
      </form>
    </div>
  );
}

export default Login;