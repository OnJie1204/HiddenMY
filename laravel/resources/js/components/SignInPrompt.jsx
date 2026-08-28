import { useLocation, useNavigate } from "react-router-dom";

// Shared "you need an account for that" modal — every write action a guest
// can reach (vote, report, wishlist, compare, itinerary, check-in, comment,
// ...) opens this instead of silently failing or crashing on a null user.
// Reuses the same overlay/modal classes as VoteModal/ReportModal so it reads
// as part of the same modal family rather than a one-off popup.
function SignInPrompt({ isOpen, onClose, message = "Login to continue." }) {
    const navigate = useNavigate();
    const location = useLocation();

    if (!isOpen) return null;

    const goTo = (path) => {
        const from = `${location.pathname}${location.search}${location.hash}`;
        onClose();
        navigate(path, { state: { from } });
    };

    return (
        <div className="vote-modal-overlay" onClick={onClose}>
            <div className="vote-modal sign-in-prompt" onClick={(e) => e.stopPropagation()}>
                <div className="vote-modal-header">
                    <h2>Login required</h2>
                    <button className="vote-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="vote-modal-body">
                    <p className="sign-in-prompt-message">{message}</p>
                    <div className="sign-in-prompt-actions">
                        <button className="vote-btn-primary" onClick={() => goTo("/login")}>Login</button>
                        <button className="vote-btn-secondary" onClick={() => goTo("/register")}>Sign Up</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SignInPrompt;
