import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';

function Navbar({ user, setUser }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.logo}>Gemora</Link>
      <div style={styles.links}>
        <Link to="/map" style={styles.link}>Map</Link>
        <Link to="/hidden-gems" style={styles.link}>Hidden Gems</Link>
        <Link to="/travel-posts" style={styles.link}>Travel Posts</Link>
        <Link to="/trip-itinerary" style={styles.link}>Trip Itinerary</Link>
      </div>
      <div style={styles.userArea}>
        <Link to="/profile" style={styles.link}>{user.name}</Link>
        <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    background: '#1e293b',
    color: '#fff',
  },
  logo: { fontWeight: 'bold', fontSize: '1.2rem', color: '#fff', textDecoration: 'none' },
  links: { display: 'flex', gap: '1.5rem' },
  link: { color: '#fff', textDecoration: 'none' },
  userArea: { display: 'flex', alignItems: 'center', gap: '1rem' },
  logoutBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '0.4rem 0.8rem',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

export default Navbar;