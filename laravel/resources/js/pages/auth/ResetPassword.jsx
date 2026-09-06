import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { resetPassword } from '@/features/auth/api';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const emailFromUrl = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await resetPassword({
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      setMessage(res.data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed');
    }
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Reset password</h2>
        <p className="subtitle">Enter your new password below.</p>
        {message && <p className="msg-success">{message}</p>}
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
            placeholder="New Password"
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
            {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
          </button>
        </div>
        <div className="form-input-wrapper">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm New Password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
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
        <button type="submit" className="btn btn-primary">Reset password</button>
        <p className="auth-link-row"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}

export default ResetPassword;