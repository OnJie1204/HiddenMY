import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sanitizeIntent } from './authRedirect';

// Runs a pending post-login action once, then scrubs it from history state so
// a refresh or a Back navigation never replays it. `handlers` maps an action
// name to a fn(intent); an action with no handler here is left untouched for
// another component on the page to consume (e.g. the detail page handles most
// actions, ReportButton handles its own "report"). A handler may return
// `false` to decline the intent — used when several instances of a component
// are mounted (one card per gem) and only the one matching intent.gemId
// should act; a declined intent stays put for the right instance.
//
// The intent is captured on the first render, not re-read from location each
// time: list and detail pages sync their filters to the URL with
// navigate({ replace: true }) on mount, which drops location.state before a
// data-dependent `ready` gate ever flips true.
export function useResumeIntent(handlers, ready = true) {
    const location = useLocation();
    const navigate = useNavigate();
    const firedRef = useRef(false);
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    const [intent] = useState(() => sanitizeIntent(location.state?.resumeIntent));

    useEffect(() => {
        if (firedRef.current || !ready || !intent) return;

        const handler = handlersRef.current[intent.action];
        if (!handler) return;

        if (handler(intent) === false) return;

        firedRef.current = true;
        const { resumeIntent, ...rest } = location.state ?? {};
        navigate(`${location.pathname}${location.search}`, {
            replace: true,
            state: Object.keys(rest).length ? rest : null,
        });
    }, [ready, intent, navigate, location]);
}
