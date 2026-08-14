import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;

function SidePanel({ group, isOpen, onClose, user, setUser }) {
    const [activeGem, setActiveGem] = useState(null);
    const [width, setWidth] = useState(340);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        setActiveGem(group && group.length === 1 ? group[0] : null);
        setIsFullscreen(false);
    }, [group]);

    // Drag-to-resize
    useEffect(() => {
        if (!isResizing) return;

        function handleMouseMove(e) {
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            setWidth(newWidth);
        }
        function handleMouseUp() {
            setIsResizing(false);
        }

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isResizing]);

    // Press 'esc' to close panel
    useEffect(() => {
        function handleEscape(e) {
            if (e.key === "Escape") {
                onClose();
            }
        }

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    if (!isOpen) return null;

    const showList = group && group.length > 1 && !activeGem;
    const gem = activeGem;

    function openGoogleMaps(g) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`, "_blank");
    }
    function openWaze(g) {
        window.open(`https://www.waze.com/ul?ll=${g.latitude},${g.longitude}&navigate=yes`, "_blank");
    }

    const handleLogout = async () => {
        localStorage.removeItem('token');
        setUser(null);
        onClose();
        navigate('/login');
    };

    const menuItems = [
        { to: '/', icon: '🏠', label: 'Home' },
        { to: '/map', icon: '🗺️', label: 'Map' },
        { to: '/hidden-gems', icon: '💎', label: 'Hidden Gems' },
        { to: '/my-hidden-gems', icon: '📍', label: 'My Hidden Gems' },
        { to: '/trip-itinerary', icon: '✈️', label: 'Trip Itinerary' },
        { to: '/profile', icon: '👤', label: 'Profile' },
    ];

    return (
        <div
            ref={panelRef}
            className={`side-panel open ${isFullscreen ? "fullscreen" : ""} ${isResizing ? "resizing" : ""}`}
            style={!isFullscreen ? { width: `${width}px` } : undefined}
        >
            {/* Header: Logo + Close */}
            <div className="side-panel-header">
                <div className="side-panel-logo">
                    <span className="side-panel-logo-icon">✦</span>
                    <span className="side-panel-logo-text">HiddenMY</span>
                </div>
                <button className="side-panel-close" onClick={onClose} aria-label="Close">
                    ✕
                </button>
            </div>

            {/* User Info: Avatar + Name (same row) */}
            {user && (
                <div className="side-panel-user">
                    <div className="side-panel-user-avatar">
                        {user.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="side-panel-user-info">
                        <p className="side-panel-user-name">{user.name || 'User'}</p>
                        <p className="side-panel-user-email">{user.email || ''}</p>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav className="side-panel-nav">
                {menuItems.map(({ to, icon, label }) => (
                    <Link
                        key={to}
                        to={to}
                        className="side-panel-nav-item"
                        onClick={onClose}
                    >
                        <span className="side-panel-nav-icon">{icon}</span>
                        <span className="side-panel-nav-label">{label}</span>
                    </Link>
                ))}
            </nav>

            {/* Divider */}
            <div className="side-panel-divider"></div>

            {/* Body Content (Gem Details) */}
            <div className="side-panel-body">
                {showList && (
                    <>
                        <h3>{group.length} posts at this spot</h3>
                        {group.map((g, i) => (
                            <div key={g.id ?? i} className="side-panel-post-item" onClick={() => setActiveGem(g)}>
                                {g.image && <img src={g.image} alt={g.title} />}
                                <div>
                                    <strong>{g.title}</strong>
                                    <p>{g.category}</p>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {gem && (
                    <>
                        {group && group.length > 1 && (
                            <button className="side-panel-back" onClick={() => setActiveGem(null)}>
                                ← Back to posts
                            </button>
                        )}

                        <div className="side-panel-gem-header">
                            {gem.image && <img src={gem.image} alt={gem.title} className="side-panel-gem-image" />}
                            <div className="side-panel-badges">
                                {gem.category && <span className="badge badge-neutral">{gem.category}</span>}
                                {gem.source === "database" && (
                                    <span className="badge badge-success">✓ Verified</span>
                                )}
                            </div>
                        </div>

                        <h2 className="side-panel-gem-title">
                            {gem.source === "database" ? "💎" : "📍"} {gem.title}
                        </h2>
                        {gem.state && <p className="side-panel-gem-meta">📍 {gem.state}</p>}
                        <p className="side-panel-gem-desc">{gem.description || "No description available."}</p>

                        {gem.address && (
                            <>
                                <h4>Address</h4>
                                <p>{gem.address}</p>
                            </>
                        )}

                        <div className="side-panel-actions">
                            <button className="side-panel-action-btn" onClick={() => openGoogleMaps(gem)}>
                                <img src={googleMapsIcon} alt="Google Maps" />
                                Google Maps
                            </button>
                            <button className="side-panel-action-btn" onClick={() => openWaze(gem)}>
                                <img src={wazeIcon} alt="Waze" />
                                Waze
                            </button>
                            <button className="side-panel-action-btn primary">
                                ➕ Add to Itinerary
                            </button>
                        </div>

                        {gem.source === "database" && gem.voteCount != null && (
                            <div className="side-panel-vote">
                                <span>{gem.voteCount} of {gem.verificationThreshold ?? 10} votes to verify</span>
                                <div className="side-panel-vote-bar">
                                    <div className="side-panel-vote-fill" style={{ width: `${Math.min(100, (gem.voteCount / (gem.verificationThreshold ?? 10)) * 100)}%` }} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer: Logout */}
            <div className="side-panel-footer">
                <button className="side-panel-logout-btn" onClick={handleLogout}>
                    🚪 Logout
                </button>
            </div>

            {!isFullscreen && (
                <div
                    className="side-panel-resize-handle"
                    onMouseDown={() => setIsResizing(true)}
                />
            )}
        </div>
    );
}

export default SidePanel;