import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyNewEmail } from '../api/auth';

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
    <div style={{ maxWidth: 400 }}>
      <h2>Email Change Verification</h2>
      {message && !error && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p><Link to="/profile">Back to Profile</Link></p>
    </div>
  );
}

export default VerifyNewEmail;