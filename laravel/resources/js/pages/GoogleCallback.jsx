import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../api/auth';
import { setToken } from '../utils/tokenStorage';

function GoogleCallback({ setUser }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const remember = searchParams.get('remember') === 'true';

    if (token) {
      setToken(token, remember);
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