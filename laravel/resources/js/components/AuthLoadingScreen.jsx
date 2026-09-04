import Spinner from './Spinner';

// Full-page branded loading screen used wherever the app has nothing to show
// yet — the initial session check in App.jsx and the Google OAuth callback.
export default function AuthLoadingScreen({ message }) {
    return (
        <div className="auth-loading-page">
            <div className="auth-loading-card">
                <span className="auth-loading-logo">
                    <span className="navbar-logo-mark" aria-hidden="true"></span>
                    HiddenMY
                </span>
                <Spinner size="lg" />
                <p className="auth-loading-text">{message}</p>
            </div>
        </div>
    );
}
