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
import UserProfile from './pages/UserProfile';
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
      <CompareProvider>
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
        <Route path="/users/:id" element={
          user ? <Layout user={user} setUser={setUser}><UserProfile /></Layout> : <Navigate to="/login" />
        } />
        <Route path="/wishlist" element={
          user ? <Layout user={user} setUser={setUser}><Wishlist /></Layout> : <Navigate to="/login" />
        } />
        <Route path="/compare" element={
          user ? <Layout user={user} setUser={setUser}><CompareGems /></Layout> : <Navigate to="/login" />
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

        <Route
          path="/my-hidden-gems/edit/:id"
          element={
              user ? (
                  <Layout user={user} setUser={setUser}>
                      <EditHiddenGem />
                  </Layout>
              ) : (
                  <Navigate to="/login" />
              )
          }
      />

        <Route
          path="/travel-posts"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <TravelPosts />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/travel-posts/create"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <CreateTravelPost />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/travel-posts/:id"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <TravelPostDetail />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/travel-posts/:id/edit"
          element={
            user ? (
              <Layout user={user} setUser={setUser}>
                <EditTravelPost />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

      </Routes>
      </CompareProvider>
    </BrowserRouter>
  );
}

export default App;