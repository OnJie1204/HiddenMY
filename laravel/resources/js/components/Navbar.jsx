import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { clearToken } from '../utils/tokenStorage';

function Navbar({ user, setUser, onMenuClick }) {
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
            <div className="navbar-left">
                <button className="navbar-menu-btn" onClick={onMenuClick} aria-label="Menu">
                    ☰
                </button>
                <Link to="/" className="navbar-logo">
                    <span className="navbar-logo-mark" aria-hidden="true">💎</span>
                    Gemora
                </Link>
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
