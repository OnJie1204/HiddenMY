import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Maps from './pages/Maps';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import VerifyEmail from './pages/VerifyEmail';
import VerifyNewEmail from './pages/VerifyNewEmail';
import ResendVerification from './pages/ResendVerification';
import GoogleCallback from './pages/GoogleCallback';
import TripItinerary from "./pages/TripItinerary";
import TripItineraryDetail from "./pages/TripItineraryDetail";
import HiddenGems from './pages/HiddenGems';  
import HiddenGemSubmission from './pages/HiddenGemSubmission';
import MyHiddenGems from './pages/MyHiddenGems';
import HiddenGemDetail from "./pages/HiddenGemDetail";
import EditHiddenGem from './pages/EditHiddenGem';
import Wishlist from './pages/Wishlist';
import TravelPosts from './pages/TravelPosts';
import TravelPostDetail from './pages/TravelPostDetail';
import CreateTravelPost from './pages/CreateTravelPost';
import EditTravelPost from './pages/EditTravelPost';
import CompareGems from './pages/CompareGems';
import { CompareProvider } from './context/CompareContext';
import { getMe } from './api/auth';
import { getToken, clearToken } from './utils/tokenStorage';
import { sanitizeIntent } from './utils/authRedirect';

// Gate for pages that need an account. Records where the guest was headed in
// `state.from` so Login (and the Google callback) can send them back there
// instead of dropping them on the home page.
function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return children;
}

// Only-a-safe-relative-path guard shared by the redirect helpers.
function safeInternalPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  // Never bounce back onto an auth page.
  if (/^\/(login|register)(\/|\?|#|$)/.test(value)) {
    return fallback;
  }
  return value;
}

// Login/Register: once the user is authenticated, leave the auth page for
// wherever they were originally headed (RequireAuth stashes it in state.from),
// falling back to home. Doing it here — not just in the page's submit handler —
// makes the destination deterministic regardless of render/navigation timing.
function RedirectIfAuthed({ user, children }) {
  const location = useLocation();
  if (user) {
    const intent = sanitizeIntent(location.state?.intent);
    return (
      <Navigate
        to={safeInternalPath(location.state?.from)}
        replace
        state={intent ? { resumeIntent: intent } : undefined}
      />
    );
  }
  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe()
        .then(res => setUser(res.data))
        .catch((err) => {
          // Only a real 401 means "not logged in". A network error / 5xx /
          // Supabase timeout must keep the token so the next load can retry —
          // clearing it here logs the user out for good on any hiccup.
          if (err?.response?.status === 401) {
            clearToken();
            setUser(null);
          }
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  if (checking) return <p>Loading...</p>;

  return (
    <BrowserRouter>
      <CompareProvider>
      <Routes>
        {/* 不需要 Navbar 的页面 */}
        <Route path="/login" element={<RedirectIfAuthed user={user}><Login onLoginSuccess={setUser} /></RedirectIfAuthed>} />
        <Route path="/register" element={<RedirectIfAuthed user={user}><Register onRegisterSuccess={setUser} /></RedirectIfAuthed>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/email/verify/:id/:hash" element={<VerifyEmail />} />
        <Route path="/verify-email" element={<VerifyNewEmail />} />
        <Route path="/resend-verification" element={<ResendVerification />} />
        <Route path="/google-callback" element={<GoogleCallback setUser={setUser} />} />

        {/* Browsable without an account — read-only, no data-changing action
            goes through without a "sign in to continue" prompt. See the
            individual pages/components (Navbar, SidePanel, ReportButton, ...)
            for how each one degrades when `user` is null. */}
        <Route path="/" element={
          <Layout user={user} setUser={setUser}><Home user={user} /></Layout>
        } />
        <Route path="/map" element={
          <Layout user={user} setUser={setUser}><Maps user={user} /></Layout>
        } />
        <Route path="/hidden-gems" element={
          <Layout user={user} setUser={setUser}><HiddenGems user={user} /></Layout>
        } />
        <Route path="/hidden-gems/:id" element={
          <Layout user={user} setUser={setUser}><HiddenGemDetail user={user} /></Layout>
        } />
        <Route path="/travel-posts" element={
          <Layout user={user} setUser={setUser}><TravelPosts user={user} /></Layout>
        } />
        <Route path="/travel-posts/:id" element={
          <Layout user={user} setUser={setUser}><TravelPostDetail user={user} /></Layout>
        } />
        <Route path="/compare" element={
          <Layout user={user} setUser={setUser}><CompareGems user={user} /></Layout>
        } />

        {/* 需要 Navbar 的页面(登入后才能进) */}
        <Route path="/profile" element={
          <RequireAuth user={user}><Layout user={user} setUser={setUser}><Profile setAppUser={setUser} /></Layout></RequireAuth>
        } />
        <Route path="/users/:id" element={
          <RequireAuth user={user}><Layout user={user} setUser={setUser}><Profile /></Layout></RequireAuth>
        } />
        <Route path="/wishlist" element={
          <RequireAuth user={user}><Layout user={user} setUser={setUser}><Wishlist user={user} /></Layout></RequireAuth>
        } />

        <Route
          path="/trip-itinerary"
          element={
            <RequireAuth user={user}>
              <Layout user={user} setUser={setUser}>
                <TripItinerary />
              </Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/trip-itinerary/:id"
          element={
            <RequireAuth user={user}>
              <Layout user={user} setUser={setUser}>
                <TripItineraryDetail />
              </Layout>
            </RequireAuth>
          }
        />


        <Route
          path="/hidden-gems/create"
          element={
            <RequireAuth user={user}>
              <Layout user={user} setUser={setUser}>
                <HiddenGemSubmission />
              </Layout>
            </RequireAuth>
          }
        />

        <Route
            path="/my-hidden-gems"
            element={
                <RequireAuth user={user}>
                    <Layout user={user} setUser={setUser}>
                        <MyHiddenGems />
                    </Layout>
                </RequireAuth>
            }
        />

        <Route
          path="/my-hidden-gems/edit/:id"
          element={
              <RequireAuth user={user}>
                  <Layout user={user} setUser={setUser}>
                      <EditHiddenGem />
                  </Layout>
              </RequireAuth>
          }
      />

        <Route
          path="/travel-posts/create"
          element={
            <RequireAuth user={user}>
              <Layout user={user} setUser={setUser}>
                <CreateTravelPost />
              </Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/travel-posts/:id/edit"
          element={
            <RequireAuth user={user}>
              <Layout user={user} setUser={setUser}>
                <EditTravelPost />
              </Layout>
            </RequireAuth>
          }
        />

      </Routes>
      </CompareProvider>
    </BrowserRouter>
  );
}

export default App;
