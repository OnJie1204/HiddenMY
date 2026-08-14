import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

// mode="nav"  -> the hamburger-menu panel (Layout.jsx): fixed to the viewport, full nav chrome.
// mode="gems" -> the Maps page's gem-detail panel: docked inside the map's left column
//                (see .side-panel-embedded in maps.css), no nav chrome.
function SidePanel({
    group, isOpen, onClose, user, setUser, side = "left", mode = "nav", headerExtra = null,
    nearby = [], nearbyLoading = false, onSelectNearby, onGemChange,
    itineraries = [], onAddToItinerary,
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [width, setWidth] = useState(340);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [itineraryOpen, setItineraryOpen] = useState(false);
    const [itineraryStatus, setItineraryStatus] = useState(null);
    const panelRef = useRef(null);
    const bodyRef = useRef(null);
    const navigate = useNavigate();

    // A new selection always lands on the first post's detail view, and resets
    // any scroll from the previously-shown gem.
    useEffect(() => {
        setActiveIndex(0);
        setIsFullscreen(false);
        setItineraryOpen(false);
        setItineraryStatus(null);
        bodyRef.current?.scrollTo({ top: 0 });
    }, [group]);

    const gem = group && group.length > 0 ? group[activeIndex] ?? group[0] : null;

    // Report the currently-displayed gem up to the parent, so it can fetch
    // nearby attractions and plot them on the map.
    useEffect(() => {
        onGemChange?.(gem);
    }, [gem, onGemChange]);

    // Drag-to-resize
    useEffect(() => {
        if (!isResizing) return;

        function handleMouseMove(e) {
            const raw = side === "right" ? window.innerWidth - e.clientX : e.clientX;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
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
    }, [isResizing, side]);

    // Press 'esc' to close panel 
    useEffect(() => {
        if (!group) return; 

        function handleEscape(e) {
            if (e.key === "Escape") {
                onClose();
            }
        }

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [group, onClose]);

    if (!group) return null;

    const showNavChrome = mode === "nav";
    const embedded = mode === "gems";
    const otherPosts = group ? group.filter((_, i) => i !== activeIndex) : [];

    function openGoogleMaps(g) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`, "_blank");
    }
    function openWaze(g) {
        window.open(`https://www.waze.com/ul?ll=${g.latitude},${g.longitude}&navigate=yes`, "_blank");
    }
    function viewDetails(g) {
        navigate(`/hidden-gems/${g.id}`);
    }

    // The backend only accepts verified gems as itinerary stops
    // (TripItineraryController uses the hiddenGems() scope), so pending ones
    // are blocked here rather than failing with a 422 after the fact.
    const canAddToItinerary = gem
        && (gem.source === "attraction" || gem.status === "verified");

    async function handleAddToItinerary(itinerary) {
        setItineraryStatus({ type: "loading", message: `Adding to "${itinerary.trip_name}"…` });
        try {
            await onAddToItinerary(itinerary, gem);
            setItineraryStatus({ type: "success", message: `Added to "${itinerary.trip_name}".` });
            setItineraryOpen(false);
        } catch (error) {
            setItineraryStatus({
                type: "error",
                message: error?.response?.data?.message || "Could not add this stop.",
            });
        }
    }

    return (
        <div
            ref={panelRef}
            className={`side-panel open ${side === "right" ? "side-panel-right" : ""} ${embedded ? "side-panel-embedded" : ""} ${isFullscreen ? "fullscreen" : ""} ${isResizing ? "resizing" : ""}`}
            style={!isFullscreen ? { width: `${width}px` } : undefined}
        >
            {/* Header: Logo + Close */}
            <div className="side-panel-header" style={showNavChrome ? undefined : { justifyContent: "flex-end" }}>
                {showNavChrome && (
                    <div className="side-panel-logo">
                        <span className="side-panel-logo-icon">✦</span>
                        <span className="side-panel-logo-text">HiddenMY</span>
                    </div>
                )}
                {!showNavChrome && (
                    <button
                        className="side-panel-fullscreen-btn"
                        onClick={() => setIsFullscreen(f => !f)}
                        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? "⤢" : "⛶"}
                    </button>
                )}
                <button className="side-panel-close" onClick={onClose} aria-label="Close">
                    ✕
                </button>
                <button className="side-sheet-icon-btn" onClick={onClose} aria-label="Close">✕</button>
            </div>

            {headerExtra && (
                <div className="side-panel-search">
                    {headerExtra}
                </div>
            )}

            {showNavChrome && user && (
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

            {showNavChrome && (
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
            )}

            {showNavChrome && <div className="side-panel-divider"></div>}

            {/* Body Content (Gem Details) */}
            <div className="side-panel-body" ref={bodyRef}>
                {embedded && !gem && (
                    <div className="side-panel-empty">
                        <p>Search, or click a hidden gem on the map, to see its details here.</p>
                    </div>
                )}

                {gem && (
                    <>
                        <div className="side-panel-gem-header">
                            {gem.image && <img src={gem.image} alt={gem.title} className="side-panel-gem-image" />}
                            <div className="side-panel-badges">
                                {gem.category && <span className="badge badge-neutral">{gem.category}</span>}
                                {gem.source === "database" && gem.status === "verified" && (
                                    <span className="badge badge-success">✓ Verified</span>
                                )}
                                {gem.source === "database" && gem.status !== "verified" && (
                                    <span className="badge badge-pending">⏳ Unverified</span>
                                )}
                            </div>
                        </div>

                        <h2>{gem.source === "database" ? "💎" : "📍"} {gem.title}</h2>
                        {gem.state && <p className="bottom-sheet-meta">📍 {gem.state}</p>}
                        <p>{gem.description || "No description available."}</p>

                        {/* Icon action row, Google Maps style: icon tile + label underneath */}
                        <div className="side-panel-actions">
                            <button className="side-panel-icon-btn" onClick={() => openGoogleMaps(gem)}>
                                <span className="side-panel-icon-btn-icon">
                                    <img src={googleMapsIcon} alt="" />
                                </span>
                                <span className="side-panel-icon-btn-label">Directions</span>
                            </button>
                            <button className="side-panel-icon-btn" onClick={() => openWaze(gem)}>
                                <span className="side-panel-icon-btn-icon">
                                    <img src={wazeIcon} alt="" />
                                </span>
                                <span className="side-panel-icon-btn-label">Waze</span>
                            </button>
                            <button
                                className="side-panel-icon-btn"
                                onClick={() => { setItineraryStatus(null); setItineraryOpen(o => !o); }}
                                disabled={!canAddToItinerary}
                                title={canAddToItinerary
                                    ? "Add to a trip itinerary"
                                    : "Only verified hidden gems can be added to an itinerary"}
                            >
                                <span className="side-panel-icon-btn-icon">➕</span>
                                <span className="side-panel-icon-btn-label">Itinerary</span>
                            </button>
                            {gem.source === "database" && (
                                <button className="side-panel-icon-btn" onClick={() => viewDetails(gem)}>
                                    <span className="side-panel-icon-btn-icon">ℹ️</span>
                                    <span className="side-panel-icon-btn-label">Details</span>
                                </button>
                            )}
                        </div>

                        {itineraryOpen && (
                            <div className="side-panel-itinerary-picker">
                                {itineraries.length === 0 ? (
                                    <p className="side-panel-nearby-status">
                                        No itineraries yet — <Link to="/trip-itinerary">create one</Link> first.
                                    </p>
                                ) : (
                                    <>
                                        <h3>Add to which trip?</h3>
                                        {itineraries.map((trip) => (
                                            <button
                                                key={trip.id}
                                                className="side-panel-itinerary-option"
                                                onClick={() => handleAddToItinerary(trip)}
                                            >
                                                ✈️ {trip.trip_name}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}

                        {itineraryStatus && (
                            <p className={`side-panel-itinerary-status ${itineraryStatus.type}`}>
                                {itineraryStatus.message}
                            </p>
                        )}

                        {gem.address && (
                            <div className="side-panel-info-row">
                                <span className="side-panel-info-icon">📍</span>
                                <p>{gem.address}</p>
                            </div>
                        )}

                        {gem.source === "database" && gem.voteCount != null && (
                            <div className="vote-progress">
                                <span>{gem.voteCount} of {gem.verificationThreshold ?? 10} votes to verify</span>
                                <div className="vote-bar">
                                    <div className="vote-fill" style={{ width: `${Math.min(100, (gem.voteCount / (gem.verificationThreshold ?? 10)) * 100)}%` }} />
                                </div>
                            </div>
                        )}

                        {/* Attractions aren't in our database, so we have no reviews/ratings for
                            them — point people to Google Maps for that instead of faking it. */}
                        {gem.source === "attraction" && (
                            <div className="side-panel-info-row side-panel-no-reviews">
                                <span className="side-panel-info-icon">ℹ️</span>
                                <p>Not in our database — open in Google Maps for reviews &amp; photos.</p>
                            </div>
                        )}

                        {/* Other posts at this same spot, below the detail */}
                        {otherPosts.length > 0 && (
                            <div className="side-panel-other-posts">
                                <h3>{otherPosts.length} other post{otherPosts.length > 1 ? "s" : ""} at this spot</h3>
                                {otherPosts.map((g) => {
                                    const index = group.indexOf(g);
                                    return (
                                        <div
                                            key={g.id ?? index}
                                            className="side-panel-post-item"
                                            onClick={() => {
                                                setActiveIndex(index);
                                                bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                                            }}
                                        >
                                            {g.image && <img src={g.image} alt={g.title} />}
                                            <div>
                                                <strong>{g.title}</strong>
                                                <p>{g.category}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {gem.source === "database" && (
                            <div className="side-panel-nearby">
                                <h3>Near this gem</h3>
                                {nearbyLoading && <p className="side-panel-nearby-status">Loading nearby spots…</p>}
                                {!nearbyLoading && nearby.length === 0 && (
                                    <p className="side-panel-nearby-status">Nothing found nearby.</p>
                                )}
                                {!nearbyLoading && nearby.length > 0 && (
                                    <div className="side-panel-nearby-list">
                                        {nearby.map((place) => (
                                            <div
                                                key={place.id}
                                                className="side-panel-nearby-item"
                                                onClick={() => onSelectNearby?.(place)}
                                            >
                                                <span className="side-panel-nearby-icon">📍</span>
                                                <div>
                                                    <strong>{place.name}</strong>
                                                    <p>{place.type.replace(/_/g, " ")} · {place.distance}m away</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer: Logout */}
            {showNavChrome && (
                <div className="side-panel-footer">
                    <button className="side-panel-logout-btn" onClick={handleLogout}>
                        🚪 Logout
                    </button>
                </div>
            )}

            {!isFullscreen && (
                <div
                    className={`side-panel-resize-handle ${side === "right" ? "side-panel-resize-handle-left" : ""}`}
                    onMouseDown={() => setIsResizing(true)}
                />
            )}
        </div>
    );
}

export default SidePanel;
