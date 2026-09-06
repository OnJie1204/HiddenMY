import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import AuthLoadingScreen from '@/components/auth/AuthLoadingScreen';
import ScrollToTop from '@/components/common/ScrollToTop';
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const VerifyNewEmail = lazy(() => import('@/pages/auth/VerifyNewEmail'));
const ResendVerification = lazy(() => import('@/pages/auth/ResendVerification'));
const GoogleCallback = lazy(() => import('@/pages/auth/GoogleCallback'));
const Home = lazy(() => import('@/pages/home/Home'));
const Maps = lazy(() => import('@/pages/hidden-gems/Maps'));
const HiddenGems = lazy(() => import('@/pages/hidden-gems/HiddenGems'));
const HiddenGemSubmission = lazy(() => import('@/pages/hidden-gems/HiddenGemSubmission'));
const MyHiddenGems = lazy(() => import('@/pages/hidden-gems/MyHiddenGems'));
const HiddenGemDetail = lazy(() => import('@/pages/hidden-gems/HiddenGemDetail'));
const EditHiddenGem = lazy(() => import('@/pages/hidden-gems/EditHiddenGem'));
const TripItinerary = lazy(() => import('@/pages/travel/TripItinerary'));
const TripItineraryDetail = lazy(() => import('@/pages/travel/TripItineraryDetail'));
const TravelPosts = lazy(() => import('@/pages/travel/TravelPosts'));
const TravelPostDetail = lazy(() => import('@/pages/travel/TravelPostDetail'));
const CreateTravelPost = lazy(() => import('@/pages/travel/CreateTravelPost'));
const EditTravelPost = lazy(() => import('@/pages/travel/EditTravelPost'));
const Profile = lazy(() => import('@/pages/users/Profile'));
const Wishlist = lazy(() => import('@/pages/users/Wishlist'));
import { getMe } from './features/auth/api';
import { getToken, clearToken } from '@/utils/auth/tokenStorage';
import { sanitizeIntent } from '@/utils/auth/authRedirect';
import { AuthPromptProvider } from '@/context/auth/AuthPromptContext';

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

  if (checking) return <AuthLoadingScreen message="Loading…" />;

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthPromptProvider>
        <Suspense fallback={<AuthLoadingScreen message="Loading…" />}>
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
        </Suspense>
      </AuthPromptProvider>
    </BrowserRouter>
  );
}

export default App;
