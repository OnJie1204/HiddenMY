import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyNewEmail } from '../features/auth/api';

function VerifyNewEmail() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('Verifying...');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Invalid verification link');
      return;
    }
    verifyNewEmail(token)
      .then(res => setMessage(res.data.message))
      .catch(err => setError(err.response?.data?.message || 'Verification failed'));
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Email change verification</h2>
        {message && !error && <p className="msg-success">{message}</p>}
        {error && <p className="msg-error">{error}</p>}
        <p className="auth-link-row"><Link to="/profile">Back to profile</Link></p>
      </div>
    </div>
  );
}

export default VerifyNewEmail;