import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { clearToken } from '../utils/tokenStorage';
import { useCompare } from '../context/CompareContext';
import Avatar from './Avatar';

function Navbar({ user, setUser, onMenuClick }) {
    const navigate = useNavigate();
    const { clearCompare } = useCompare();

    const handleLogout = async () => {
        await logout();
        clearToken();
        setUser(null);
        clearCompare();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-left">
                <button className="navbar-menu-btn" onClick={onMenuClick} aria-label="Menu">
                    ☰
                </button>
                <Link to="/" className="navbar-logo">
                    <span className="navbar-logo-mark" aria-hidden="true"></span>
                    HiddenMY
                </Link>
            </div>
            <div className="navbar-user">
                {user ? (
                    <>
                        <Link to="/profile" className="navbar-username">
                            <Avatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
                            {user.name}
                        </Link>
                        <button onClick={handleLogout} className="navbar-logout">Logout</button>
                    </>
                ) : (
                    <div className="navbar-guest-actions">
                        <Link to="/login" className="navbar-login-link">Login</Link>
                        <Link to="/register" className="navbar-register-link">Sign Up</Link>
                    </div>
                )}
            </div>
        </nav>
    );
}

export default Navbar;
