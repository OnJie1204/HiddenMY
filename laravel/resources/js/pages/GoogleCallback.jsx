import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../api/auth';
import { setToken } from '../utils/tokenStorage';
import { sanitizeIntent } from '../utils/authRedirect';

// Where to send the user once Google auth completes. Login stashes the page the
// guest originally wanted in sessionStorage (router state can't survive the
// OAuth round trip); fall back to "/" when there's nothing valid to restore.
//
// Resolved once and cached at module scope: React StrictMode double-invokes the
// effect (and remounts the component) in dev, so reading-and-clearing the key
// on every call would hand the second call an empty value and bounce the user
// to "/". The module variable survives the remount; the real page load that
// follows navigation throws the module away.
let resolvedRedirect;
let resolvedIntent;

function consumePostLoginRedirect() {
  if (resolvedRedirect !== undefined) {
    return resolvedRedirect;
  }
  let target = '/';
  try {
    const stored = sessionStorage.getItem('postLoginRedirect');
    sessionStorage.removeItem('postLoginRedirect');
    if (typeof stored === 'string' && stored.startsWith('/') && !stored.startsWith('//')) {
      target = stored;
    }
  } catch {
    /* storage disabled — keep the default */
  }
  resolvedRedirect = target;
  return target;
}

// The pending action Login stashed before handing off to Google (router state
// can't survive the OAuth round trip). Cached at module scope for the same
// StrictMode-remount reason as the redirect above.
function consumePostLoginIntent() {
  if (resolvedIntent !== undefined) {
    return resolvedIntent;
  }
  let intent = null;
  try {
    const raw = sessionStorage.getItem('postLoginIntent');
    sessionStorage.removeItem('postLoginIntent');
    if (raw) intent = sanitizeIntent(JSON.parse(raw));
  } catch {
    /* storage disabled or malformed — no resume */
  }
  resolvedIntent = intent;
  return intent;
}

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
        const intent = consumePostLoginIntent();
        navigate(consumePostLoginRedirect(), {
          replace: true,
          state: intent ? { resumeIntent: intent } : undefined,
        });
      });
    } else {
      navigate('/login');
    }
  }, [searchParams]);

  return <p>Logging you in...</p>;
}

export default GoogleCallback;
