import { useNavigate, useLocation } from 'react-router-dom';

// '/' is the root. The map page now sits in the standard padded container and
// only carries a floating back control while in its fullscreen mode.
const HIDDEN_ON_PATHS = new Set(['/']);

function BackButton() {
    const navigate = useNavigate();
    const location = useLocation();

    if (HIDDEN_ON_PATHS.has(location.pathname)) return null;

    const handleBack = () => {
        if (location.state?.returnTo) {
            navigate(location.state.returnTo.pathname, {
                replace: true,
                state: location.state.returnTo.state,
            });
            return;
        }

        // location.key is "default" only for the first entry in the history
        // stack (direct load / opened in a new tab) — there is nothing to go
        // back to, so fall back to the home page.
        if (location.key === 'default') {
            navigate('/');
        } else {
            navigate(-1);
        }
    };

    return (
        <button type="button" className="app-back-btn" onClick={handleBack}>
            ← Back
        </button>
    );
}

export default BackButton;
