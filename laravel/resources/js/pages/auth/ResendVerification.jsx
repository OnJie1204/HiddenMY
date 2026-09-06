import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resendVerification } from '@/features/auth/api';

function ResendVerification() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await resendVerification(email);
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend');
    }
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Resend verification email</h2>
        <p className="subtitle">Enter your email and we'll resend the verification link.</p>
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
        <button type="submit" className="btn btn-primary">Resend verification email</button>
        <p className="auth-link-row"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}

export default ResendVerification;