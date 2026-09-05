import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '../features/auth/api';

function VerifyEmail() {
  const { id, hash } = useParams();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('Verifying...');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = '?' + searchParams.toString();
    verifyEmail(id, hash, params)
      .then(res => setMessage(res.data.message))
      .catch(err => setError(err.response?.data?.message || 'Verification failed'));
  }, [id, hash, searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Email verification</h2>
        {message && !error && <p className="msg-success">{message}</p>}
        {error && <p className="msg-error">{error}</p>}
        {error && (
          <p className="auth-link-row">
            Link expired or invalid? <Link to="/resend-verification">Request a new verification email</Link>
          </p>
        )}
        <p className="auth-link-row"><Link to="/login">Go to login</Link></p>
      </div>
    </div>
  );
}

export default VerifyEmail;