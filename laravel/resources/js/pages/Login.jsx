import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { login } from '../api/auth';
import { setToken } from '../utils/tokenStorage';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [infoMessage] = useState(location.state?.message || '');
  const requestedReturnPath = location.state?.from;
  const returnPath = typeof requestedReturnPath === 'string'
    && requestedReturnPath.startsWith('/')
    && !requestedReturnPath.startsWith('//')
      ? requestedReturnPath
      : '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await login(email, password);
      setToken(res.data.token, rememberMe);
      onLoginSuccess(res.data.user);
      navigate(returnPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-split-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <span className="auth-brand-logo">
            <span className="navbar-logo-mark" aria-hidden="true"></span>
            HiddenMY
          </span>
          <h1>Discover Malaysia's Hidden Gems</h1>
          <p>Every state has spots that never make the travel guides. Find them, visit them, and add your own.</p>
          <ul className="auth-brand-features">
            <li>Explore hand-picked hidden gems across Malaysia</li>
            <li>Plan and organize your own trip itineraries</li>
            <li>Submit and share the spots only you know about</li>
          </ul>
        </div>
      </div>

      <div className="auth-form-panel">
        <form onSubmit={handleSubmit} className="auth-card">
          <h2>Welcome back</h2>
          <p className="subtitle">Login to continue to HiddenMY</p>
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
          <div className="form-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-input"
            />
            <button
              type="button"
              className="form-input-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
            </button>
          </div>
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
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Login'}
          </button>
          <a href={`/api/auth/google/redirect?remember=${rememberMe}`} className="btn" style={{ background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', marginTop: '0.75rem', display: 'block', textAlign: 'center' }}>
            Continue with Google
          </a>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => navigate(returnPath)}
          >
            Continue as Guest
          </button>
          <p className="auth-link-row">Don't have an account? <Link to="/register" state={{ from: returnPath }}>Sign Up</Link></p>
          <p className="auth-link-row"><Link to="/resend-verification">Resend verification email</Link></p>
        </form>
      </div>
    </div>
  );
}

export default Login;
