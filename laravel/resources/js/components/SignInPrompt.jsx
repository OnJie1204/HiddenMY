import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { sanitizeIntent } from "../utils/authRedirect";

// Shared "you need an account for that" modal — every write action a guest
// can reach (vote, report, wishlist, itinerary, check-in, comment,
// ...) opens this instead of silently failing or crashing on a null user.
// Reuses the same overlay/modal classes as VoteModal/ReportModal so it reads
// as part of the same modal family rather than a one-off popup.
// `intent` (optional): the action the guest was trying to take — carried
// through login so the origin page can resume it (see sanitizeIntent).
// `returnTo` (optional): overrides the page to come back to, for when the
// current URL alone can't restore context — e.g. the map, where the selected
// gem lives in component state, so we come back to `/map?gemId=<id>` instead.
function SignInPrompt({ isOpen, onClose, message = "Login to continue.", intent = null, returnTo = null }) {
    const navigate = useNavigate();
    const location = useLocation();

    if (!isOpen) return null;

    const goTo = (path) => {
        const currentPath = `${location.pathname}${location.search}${location.hash}`;
        const from = typeof returnTo === "string"
            && returnTo.startsWith("/") && !returnTo.startsWith("//")
                ? returnTo
                : currentPath;
        onClose();
        // replace (not push): once signed in, Back should skip the auth page
        // and return to wherever the visitor was before it.
        navigate(path, { state: { from, intent: sanitizeIntent(intent) }, replace: true });
    };

    // Portaled to <body> — see ReportModal.jsx for why (a hovered ancestor
    // card's :hover transform would otherwise hijack this fixed-position
    // modal's containing block, making it snap between full-screen and
    // pinned-to-the-card).
    return createPortal((
        <div className="vote-modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
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
    ), document.body);
}

export default SignInPrompt;
