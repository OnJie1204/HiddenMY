import { useNavigate, useLocation } from 'react-router-dom';

// '/' is the root. '/map' renders a full-bleed map hero flush against the
// navbar (negative top margin), so it carries its own floating back control
// inside Maps.jsx instead of this one.
const HIDDEN_ON_PATHS = new Set(['/', '/map']);

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
