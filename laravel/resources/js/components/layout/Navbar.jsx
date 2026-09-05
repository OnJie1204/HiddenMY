import { startTransition } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '@/features/auth/api';
import { clearToken } from '@/utils/auth/tokenStorage';
import { loginNavOptions } from '@/utils/auth/authRedirect';
import Avatar from '@/components/common/Avatar';

function Navbar({ user, setUser, onMenuClick }) {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await logout();
        clearToken();
        // BrowserRouter applies navigate() through startTransition (low
        // priority), but setUser is a normal synchronous update. Left as two
        // separate updates, the synchronous setUser(null) commits first with
        // the old protected route still in context, so RequireAuth fires its
        // own redirect to /login before the pending navigate('/') lands.
        // Wrapping both in the same transition keeps them in one render.
        startTransition(() => {
            navigate('/');
            setUser(null);
        });
    };

    return (
        <nav className="navbar">
            <div className="navbar-left">
                <button
                    className="navbar-menu-btn"
                    onClick={onMenuClick}
                    aria-label="Menu"
                >
                    ☰
                </button>

                <Link to="/" className="navbar-logo">
                    <span
                        className="navbar-logo-mark"
                        aria-hidden="true"
                    ></span>
                    HiddenMY
                </Link>
            </div>

            <div className="navbar-user">
                {user ? (
                    <>
                        <Link
                            to="/profile"
                            className="navbar-username"
                        >
                            <Avatar
                                name={user.name}
                                avatarUrl={user.avatar_url}
                                size="sm"
                            />
                            {user.name}
                        </Link>

                        <Link
                            to="/wishlist"
                            className="navbar-wishlist"
                        >
                            ♡
                        </Link>

                        <button
                            onClick={handleLogout}
                            className="navbar-logout"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <div className="navbar-guest-actions">
                        <Link
                            to="/login"
                            replace
                            state={loginNavOptions(location).state}
                            className="navbar-login-link"
                        >
                            Login
                        </Link>

                        <Link
                            to="/register"
                            replace
                            state={loginNavOptions(location).state}
                            className="navbar-register-link"
                        >
                            Sign Up
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}

export default Navbar;