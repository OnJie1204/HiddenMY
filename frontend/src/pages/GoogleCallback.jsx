import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../api/auth';

function GoogleCallback({ setUser }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('token', token);
      getMe().then(res => {
        setUser(res.data);
        navigate('/');
      });
    } else {
      navigate('/login');
    }
  }, [searchParams]);

  return <p>Logging you in...</p>;
}

export default GoogleCallback;