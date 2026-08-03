import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { clearToken } from '../utils/tokenStorage';

function Navbar({ user, setUser }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    clearToken();
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">Gemora</Link>
      <div className="navbar-links">
        <Link to="/map" className="navbar-link">Map</Link>
        <Link to="/hidden-gems" className="navbar-link">Hidden Gems</Link>
        <Link to="/travel-posts" className="navbar-link">Travel Posts</Link>
        <Link to="/trip-itinerary" className="navbar-link">Trip Itinerary</Link>
      </div>
      <div className="navbar-user">
        <Link to="/profile" className="navbar-username">{user.name}</Link>
        <button onClick={handleLogout} className="navbar-logout">Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;