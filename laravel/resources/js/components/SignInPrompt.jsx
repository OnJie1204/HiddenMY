import { useNavigate } from "react-router-dom";

// Shared "you need an account for that" modal — every write action a guest
// can reach (vote, report, wishlist, compare, itinerary, check-in, comment,
// ...) opens this instead of silently failing or crashing on a null user.
// Reuses the same overlay/modal classes as VoteModal/ReportModal so it reads
// as part of the same modal family rather than a one-off popup.
function SignInPrompt({ isOpen, onClose, message = "Sign in to continue." }) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const goTo = (path) => {
        onClose();
        navigate(path);
    };

    return (
        <div className="vote-modal-overlay" onClick={onClose}>
            <div className="vote-modal sign-in-prompt" onClick={(e) => e.stopPropagation()}>
                <div className="vote-modal-header">
                    <h2>Sign in required</h2>
                    <button className="vote-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="vote-modal-body">
                    <p className="sign-in-prompt-message">{message}</p>
                    <div className="sign-in-prompt-actions">
                        <button className="vote-btn-primary" onClick={() => goTo("/login")}>Log In</button>
                        <button className="vote-btn-secondary" onClick={() => goTo("/register")}>Create an account</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SignInPrompt;
