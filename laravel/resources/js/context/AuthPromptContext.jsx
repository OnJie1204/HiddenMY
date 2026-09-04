import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import SignInPrompt from "../components/SignInPrompt";
import { getAuthPrompt } from "../constants/authPrompts";
import { sanitizeIntent } from "../utils/authRedirect";

const AuthPromptContext = createContext(null);

export function AuthPromptProvider({ children }) {
    const [request, setRequest] = useState(null);
    const location = useLocation();

    const closeAuthPrompt = useCallback(() => {
        setRequest(null);
    }, []);

    const requireAuth = useCallback(({
        reason,
        gemId = null,
        message = null,
        intent = null,
        returnTo = null,
    }) => {
        const preset = getAuthPrompt(reason);
        const requestedIntent = intent ?? (
            preset?.action
                ? { action: preset.action, gemId }
                : null
        );

        setRequest({
            message: message ?? preset?.message ?? "Login to continue.",
            intent: sanitizeIntent(requestedIntent),
            returnTo,
        });
    }, []);

    // The provider outlives individual pages. If navigation happens through
    // Back/Forward or another control while the prompt is open, do not carry a
    // stale prompt onto the next route.
    useEffect(() => {
        setRequest(null);
    }, [location.pathname, location.search, location.hash]);

    const isAuthPromptOpen = request !== null;
    const value = useMemo(
        () => ({ requireAuth, closeAuthPrompt, isAuthPromptOpen }),
        [requireAuth, closeAuthPrompt, isAuthPromptOpen],
    );

    return (
        <AuthPromptContext.Provider value={value}>
            {children}
            <SignInPrompt
                isOpen={isAuthPromptOpen}
                onClose={closeAuthPrompt}
                message={request?.message}
                intent={request?.intent}
                returnTo={request?.returnTo}
            />
        </AuthPromptContext.Provider>
    );
}

export function useAuthPrompt() {
    const context = useContext(AuthPromptContext);

    if (!context) {
        throw new Error("useAuthPrompt must be used inside AuthPromptProvider.");
    }

    return context;
}
