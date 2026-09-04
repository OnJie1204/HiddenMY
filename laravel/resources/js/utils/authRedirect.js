// Router-nav args that send a guest to /login while recording the page they
// were on, so Login (email) and GoogleCallback (OAuth) can return them there
// instead of dropping them on the home page. `replace: true` keeps /login out
// of the history stack, so pressing Back after signing in never lands the
// (now authenticated) user back on the login screen. Mirrors SignInPrompt.
export function loginNavOptions(location) {
    return {
        replace: true,
        state: {
            from: `${location.pathname}${location.search}${location.hash}`,
        },
    };
}

function isSafeInternalPath(value) {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

// Routes a signed-out visitor is allowed to view (the public section in
// App.jsx). Everything else is behind RequireAuth, so sending a guest there
// just bounces them straight back to /login.
const GUEST_VIEWABLE_PATHS = [
    /^\/(\?|#|$)/,
    /^\/map(\/|\?|#|$)/,
    /^\/hidden-gems(\/|\?|#|$)/,
    /^\/travel-posts(\/|\?|#|$)/,
    /^\/compare(\/|\?|#|$)/,
];

// Routes that live under a public prefix but still require an account.
const GUEST_BLOCKED_PATHS = [
    /^\/hidden-gems\/create(\/|\?|#|$)/,
    /^\/travel-posts\/create(\/|\?|#|$)/,
    /^\/travel-posts\/[^/]+\/edit(\/|\?|#|$)/,
];

// A guest's pending action, captured the moment they hit the login wall so
// the page they return to can pick it up again. Kept tiny and JSON-safe — it
// rides through router state, and (across the OAuth round trip) sessionStorage.
//   { action: <one of RESUMABLE_ACTIONS>, gemId?: number }
const RESUMABLE_ACTIONS = new Set([
    'wishlist', 'itinerary', 'report', 'verify', 'vote', 'comment',
]);

export function sanitizeIntent(intent) {
    if (!intent || typeof intent !== 'object') return null;
    if (!RESUMABLE_ACTIONS.has(intent.action)) return null;

    const clean = { action: intent.action };
    if (intent.gemId != null && /^\d+$/.test(String(intent.gemId))) {
        clean.gemId = Number(intent.gemId);
    }
    return clean;
}

// Note: only 'wishlist' is auto-run on the far side of login (no extra input,
// private, one tap to undo). Every other action just re-opens its UI so the
// user still presses submit — each page's resume handler enforces this.

// Where "Continue as Guest" should land: back on the page the visitor came
// from when a guest may see it, otherwise the home page.
export function guestReturnPath(location) {
    const from = location.state?.from;
    if (!isSafeInternalPath(from)) return '/';
    if (GUEST_BLOCKED_PATHS.some((re) => re.test(from))) return '/';
    if (GUEST_VIEWABLE_PATHS.some((re) => re.test(from))) return from;
    return '/';
}
