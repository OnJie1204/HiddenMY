import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/features/auth/api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Forgot password</h2>
        <p className="subtitle">Enter your email and we'll send you a reset link.</p>
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
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
        <p className="auth-link-row"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}

export default ForgotPassword;