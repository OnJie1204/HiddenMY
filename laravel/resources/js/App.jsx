import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { getMe } from './api/auth';
import { getToken, clearToken } from './utils/tokenStorage';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe()
        .then(res => setUser(res.data))
        .catch(() => clearToken())
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  if (checking) return <p>Loading...</p>;

  return (
    <BrowserRouter>
      <Routes>
        {/* 不需要 Navbar 的页面 */}
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLoginSuccess={setUser} />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <Register onRegisterSuccess={setUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/email/verify/:id/:hash" element={<VerifyEmail />} />
        <Route path="/verify-email" element={<VerifyNewEmail />} />
        <Route path="/resend-verification" element={<ResendVerification />} />
        <Route path="/google-callback" element={<GoogleCallback setUser={setUser} />} />

        {/* 需要 Navbar 的页面(登入后才能进) */}
        <Route path="/" element={
          user ? <Layout user={user} setUser={setUser}><Home user={user} /></Layout> : <Navigate to="/login" />
        } />
        <Route path="/map" element={
          user ? <Layout user={user} setUser={setUser}><Maps /></Layout> : <Navigate to="/login" />
        } />
        <Route path="/profile" element={
          user ? <Layout user={user} setUser={setUser}><Profile setAppUser={setUser} /></Layout> : <Navigate to="/login" />
        } />

        <Route
          path="/trip-itinerary"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <TripItinerary />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/trip-itinerary/:id"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <TripItineraryDetail />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/hidden-gems"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <HiddenGems />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/hidden-gems/:id"
          element={
              user ? (
                  <Layout user={user} setUser={setUser}>
                      <HiddenGemDetail />
                  </Layout>
              ) : (
                  <Navigate to="/login" />
              )
          }
      />

        <Route
          path="/hidden-gems/create"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <HiddenGemSubmission />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
            path="/my-hidden-gems"
            element={
                user ? (
                    <Layout user={user} setUser={setUser}>
                        <MyHiddenGems />
                    </Layout>
                ) : (
                    <Navigate to="/login" />
                )
            }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;