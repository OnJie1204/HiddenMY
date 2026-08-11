import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { clearToken } from '../utils/tokenStorage';

const navLinkClassName = ({ isActive }) => `navbar-link${isActive ? ' active' : ''}`;

function Navbar({ user, setUser }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    clearToken();
    setUser(null);
    navigate('/login');
  };

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <span className="navbar-logo-mark" aria-hidden="true">💎</span>
        Gemora
      </Link>
      <div className="navbar-links">
        <NavLink to="/map" className={navLinkClassName}>Map</NavLink>
        <NavLink to="/hidden-gems" className={navLinkClassName}>Hidden Gems</NavLink>
        <NavLink to="/my-hidden-gems" className={navLinkClassName}>My Hidden Gems</NavLink>
        <NavLink to="/trip-itinerary" className={navLinkClassName}>Trip Itinerary</NavLink>
      </div>
      <div className="navbar-user">
        <Link to="/profile" className="navbar-username">
          <span className="navbar-avatar" aria-hidden="true">{initial}</span>
          {user.name}
        </Link>
        <button onClick={handleLogout} className="navbar-logout">Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;