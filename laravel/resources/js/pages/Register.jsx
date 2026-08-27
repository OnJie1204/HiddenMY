import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { register } from '../api/auth';
import { getPasswordStrength } from '../utils/password';

function Register({ onRegisterSuccess }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', password_confirmation: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturnPath = location.state?.from;
  const returnPath = typeof requestedReturnPath === 'string'
    && requestedReturnPath.startsWith('/')
    && !requestedReturnPath.startsWith('//')
      ? requestedReturnPath
      : '/';
  const passwordStrength = getPasswordStrength(form.password);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await register(form);
      navigate('/login', { state: { message: res.data.message, from: returnPath } });
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(', ') : 'Registration failed');
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
          <h2>Sign Up</h2>
          <p className="subtitle">Join HiddenMY and start exploring</p>
          {error && <p className="msg-error">{error}</p>}
          <input name="name" placeholder="Name" onChange={handleChange} required className="form-input" />
          <input name="email" type="email" placeholder="Email" onChange={handleChange} required className="form-input" />
          <div className="form-input-wrapper">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              onChange={handleChange}
              required
              className="form-input"
            />
            <button
              type="button"
              className="form-input-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
            </button>
          </div>

          {form.password && (
            <div className="password-strength">
              <div className="password-strength-bar">
                <span className={`password-strength-seg ${passwordStrength.level >= 1 ? `filled level-${passwordStrength.level}` : ''}`} />
                <span className={`password-strength-seg ${passwordStrength.level >= 2 ? `filled level-${passwordStrength.level}` : ''}`} />
                <span className={`password-strength-seg ${passwordStrength.level >= 3 ? `filled level-${passwordStrength.level}` : ''}`} />
              </div>
              <span className={`password-strength-label strength-${passwordStrength.level}`}>
                {passwordStrength.label}
              </span>
            </div>
          )}
          <p className={`password-hint ${form.password.length >= 8 ? 'password-hint-ok' : ''}`}>
            {form.password.length >= 8 ? '✓' : '•'} At least 8 characters
          </p>

          <div className="form-input-wrapper">
            <input
              name="password_confirmation"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              onChange={handleChange}
              required
              className="form-input"
            />
            <button
              type="button"
              className="form-input-toggle"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
            </button>
          </div>
          {form.password_confirmation && (
            <p className={`password-hint ${form.password === form.password_confirmation ? 'password-hint-ok' : 'password-hint-bad'}`}>
              {form.password === form.password_confirmation ? '✓ Passwords match' : '✗ Passwords do not match'}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Signing up…' : 'Sign Up'}
          </button>
          <p className="auth-link-row">Already have an account? <Link to="/login" state={{ from: returnPath }}>Login</Link></p>
        </form>
      </div>
    </div>
  );
}

export default Register;
