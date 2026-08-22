import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";
import GemImage from "./GemImage";
import Avatar from "./Avatar";
import TruncatedText from "./TruncatedText";
import ReportModal from "./ReportModal";
import VerifyReportModal from "./VerifyReportModal";
import { useCompare } from "../context/CompareContext";
import { getReportForLocation } from "../api/reports";

function getVotePhotoUrl(photoPath) {
    if (!photoPath) return "";

    if (/^https?:\/\//i.test(photoPath)) {
        return photoPath;
    }

    const relativePath = String(photoPath).replace(/^\/+/, "");

    return relativePath.startsWith("storage/")
        ? `/${relativePath}`
        : `/storage/${relativePath}`;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;

function SidePanel({
    group, isOpen, onClose, user, setUser, mode = "nav", headerExtra = null,
    nearby = [], nearbyLoading = false, onSelectNearby, onGemChange,
    itineraries = [], onAddToItinerary,
    wishlistIds = new Set(), onToggleWishlist,
    reviews = [], reviewsLoading = false,
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [width, setWidth] = useState(340);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [itineraryOpen, setItineraryOpen] = useState(false);
    const [itineraryStatus, setItineraryStatus] = useState(null);
    const [wishlistBusy, setWishlistBusy] = useState(false);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [activeReport, setActiveReport] = useState(null);
    const [activeReportLoading, setActiveReportLoading] = useState(false);
    const [localReportStatus, setLocalReportStatus] = useState(null);

    const [localStatus, setLocalStatus] = useState(null);
    const bodyRef = useRef(null);
    const navigate = useNavigate();
    const { isComparing, toggleCompare, canAddMore, maxCompare } = useCompare();

    // A new selection always lands on the first post's detail view, and resets
    // any scroll from the previously-shown gem.
    useEffect(() => {
        setActiveIndex(0);
        setIsFullscreen(false);
        setItineraryOpen(false);
        setItineraryStatus(null);
        setLocalReportStatus(null);
        setLocalStatus(null);
        bodyRef.current?.scrollTo({ top: 0 });
    }, [group]);

    const gem = group && group.length > 0 ? group[activeIndex] ?? group[0] : null;
    const reportStatus = localReportStatus ?? gem?.reportStatus;
    const status = localStatus ?? gem?.status;

    useEffect(() => {
        if (!gem || gem.source !== "database" || reportStatus !== "under_review") {
            setActiveReport(null);
            return;
        }
        let cancelled = false;
        setActiveReportLoading(true);
        getReportForLocation(gem.id)
            .then((res) => { if (!cancelled) setActiveReport(res.data.data); })
            .catch(() => { if (!cancelled) setActiveReport(null); })
            .finally(() => { if (!cancelled) setActiveReportLoading(false); });
        return () => { cancelled = true; };
    }, [gem, reportStatus]);

    // Report the currently-displayed gem up to the parent, so it can fetch
    // nearby attractions and plot them on the map.
    useEffect(() => {
        onGemChange?.(gem);
    }, [gem, onGemChange]);

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

    const showNavChrome = mode === "nav";
    const embedded = mode === "gems";
    const otherPosts = group ? group.filter((_, i) => i !== activeIndex) : [];

    function openGoogleMaps(g) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`, "_blank");
    }
    function openWaze(g) {
        window.open(`https://www.waze.com/ul?ll=${g.latitude},${g.longitude}&navigate=yes`, "_blank");
    }
    // Attractions come from OpenStreetMap, not our database, so there's no
    // internal detail page for them — send the user to a Google search instead.
    function openGoogleSearch(g) {
        const query = encodeURIComponent([g.title, g.address].filter(Boolean).join(" "));
        window.open(`https://www.google.com/search?q=${query}`, "_blank");
    }

    function viewDetails(g) {
        if (g.source === "attraction") {
            openGoogleSearch(g);
            return;
        }
        navigate(`/hidden-gems/${g.id}`);
    }
    function viewStories(g) {
        navigate(`/hidden-gems/${g.id}`, { state: { openTab: "stories" } });
    }

    // The backend only accepts publicly-visible gems as itinerary stops
    // (TripItineraryController uses the publiclyVisible() scope: 'hidden_gem'
    // and 'pending_community_vote'), so anything still awaiting AI review is
    // blocked here rather than failing with a 422 after the fact.
    const canAddToItinerary = gem
        && (gem.source === "attraction" || status === "hidden_gem" || status === "pending_community_vote");

    // OSM attractions aren't Location records, so there's nothing to wishlist
    // or compare — only our own database gems that have passed AI review qualify.
    const canWishlist = gem
        && gem.source === "database"
        && (status === "hidden_gem" || status === "pending_community_vote");
    const isWishlisted = gem && wishlistIds.has(gem.id);
    const canCompare = canWishlist;
    const comparing = gem && isComparing(gem.id);

    // Same eligibility as wishlist/compare (matches the backend's own gate) —
    // and only when there isn't already a report open on it.
    const canReport = gem
        && gem.source === "database"
        && (status === "hidden_gem" || status === "pending_community_vote")
        && reportStatus !== "under_review";

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

    async function handleToggleWishlist() {
        if (!gem || wishlistBusy) return;
        setWishlistBusy(true);
        try {
            await onToggleWishlist(gem, isWishlisted);
        } catch (error) {
            // Toggling is a single tap action — surface failures via the same
            // itinerary status line rather than adding a second status area.
            setItineraryStatus({
                type: "error",
                message: error?.response?.data?.message || "Could not update your wishlist.",
            });
        } finally {
            setWishlistBusy(false);
        }
    }

    const handleLogout = async () => {
        localStorage.removeItem('token');
        setUser(null);
        onClose();
        navigate('/login');
    };

    const menuItems = [
        { to: '/', label: 'Home' },
        { to: '/map', label: 'Map' },
        { to: '/hidden-gems', label: 'Hidden Gems' },
        { to: '/my-hidden-gems', label: 'My Hidden Gems' },
        { to: '/wishlist', label: 'Wishlist' },
        { to: '/trip-itinerary', label: 'Trip Itinerary' },
        { to: '/travel-posts', label: 'Travel Posts' },
        { to: '/profile', label: 'Profile' },
    ];

    return (
        <div
            className={`side-panel open ${embedded ? "side-panel-embedded" : ""} ${isFullscreen ? "fullscreen" : ""} ${isResizing ? "resizing" : ""}`}
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
            </div>

            {headerExtra && (
                <div className="side-panel-search">
                    {headerExtra}
                </div>
            )}

            {showNavChrome && user && (
                <div className="side-panel-user">
                    <Avatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
                    <div className="side-panel-user-info">
                        <p className="side-panel-user-name">{user.name || 'User'}</p>
                        <p className="side-panel-user-email">{user.email || ''}</p>
                    </div>
                </div>
            )}

            {showNavChrome && (
                <nav className="side-panel-nav">
                    {menuItems.map(({ to, label }) => (
                        <Link
                            key={to}
                            to={to}
                            className="side-panel-nav-item"
                            onClick={onClose}
                        >
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
                            <GemImage src={gem.image} alt={gem.title} className="side-panel-gem-image" />
                            <div className="side-panel-badges">
                                {gem.category && <span className="badge badge-neutral">{gem.category}</span>}
                                {gem.attractionType && (
                                    <span className="badge badge-neutral">{gem.attractionType.replace(/_/g, " ")}</span>
                                )}
                                {/* A report is a provisional flag layered on top of `status`, not a
                                    replacement for it (see gemStatus.js) — shown in the same badge
                                    slot, in priority, without implying the gem's real status changed. */}
                                {gem.source === "database" && reportStatus === "under_review" && (
                                    <span className="badge badge-reported">⚠ Reported</span>
                                )}
                                {gem.source === "database" && reportStatus !== "under_review" && status === "hidden_gem" && (
                                    <span className="badge badge-success">Hidden Gem</span>
                                )}
                                {gem.source === "database" && reportStatus !== "under_review" && status === "pending_community_vote" && (
                                    <span className="badge badge-pending">Awaiting Votes</span>
                                )}
                                {gem.source === "database" && reportStatus !== "under_review" && status === "ai_rejected" && (
                                    <span className="badge badge-pending">Not Accepted</span>
                                )}
                                {gem.source === "database" && reportStatus !== "under_review" && status === "delisted" && (
                                    <span className="badge badge-reported">Delisted</span>
                                )}
                            </div>
                        </div>

                        <div className="side-panel-title-row">
                            <h2 className="side-panel-gem-title">
                                {gem.title}
                            </h2>
                            <div className="hidden-gems-card-icon-actions">
                                {onToggleWishlist && (
                                    <button
                                        type="button"
                                        className="wishlist-remove-btn"
                                        onClick={handleToggleWishlist}
                                        disabled={!canWishlist || wishlistBusy}
                                        title={canWishlist
                                            ? (isWishlisted ? "Remove from wishlist" : "Save to wishlist")
                                            : "Only gems that have passed AI review can be saved"}
                                    >
                                        {isWishlisted ? "♥" : "♡"}
                                    </button>
                                )}
                                {gem.source === "database" && (
                                    <button
                                        type="button"
                                        className={`compare-toggle-btn ${comparing ? "compare-toggle-btn-active" : ""}`}
                                        onClick={() => toggleCompare(gem)}
                                        disabled={!canCompare || (!comparing && !canAddMore)}
                                        title={!canCompare
                                            ? "Only gems that have passed AI review can be compared"
                                            : comparing
                                                ? "Remove from comparison"
                                                : (canAddMore ? "Add to comparison" : `You can compare up to ${maxCompare} at a time`)}
                                    >
                                        {comparing ? "☑" : "☐"}
                                    </button>
                                )}
                                {gem.source === "database" && (status === "hidden_gem" || status === "pending_community_vote") && (
                                    <button
                                        type="button"
                                        className="report-toggle-btn"
                                        onClick={() => setReportModalOpen(true)}
                                        disabled={!canReport}
                                        title={reportStatus === "under_review"
                                            ? "This gem already has a report under review"
                                            : "Report a problem with this gem"}
                                    >
                                        ⚠
                                    </button>
                                )}
                            </div>
                        </div>
                        {gem.state && <p className="side-panel-gem-meta">{gem.state}</p>}
                        <p className="side-panel-gem-desc">
                            <TruncatedText text={gem.description || "No description available."} limit={100} />
                        </p>

                        {gem.source === "database" && reportStatus === "under_review" && (
                            <div className="report-banner">
                                <div className="report-banner-text">
                                    <strong>⚠ This gem has been reported</strong>
                                    <p>
                                        {activeReportLoading
                                            ? "Loading report details…"
                                            : activeReport
                                                ? `Reason: ${activeReport.reason.replace(/_/g, " ")}. The community is voting to confirm or dispute it (${activeReport.confirm_count} confirm / ${activeReport.dispute_count} dispute).`
                                                : "The community is voting to confirm or dispute it."}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="report-banner-verify-btn"
                                    onClick={() => setVerifyModalOpen(true)}
                                    disabled={!activeReport}
                                >
                                    Help Verify
                                </button>
                            </div>
                        )}

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
                                    : "Only gems that have passed AI review can be added to an itinerary"}
                            >
                                <span className="side-panel-icon-btn-icon">➕</span>
                                <span className="side-panel-icon-btn-label">Itinerary</span>
                            </button>
                            <button className="side-panel-icon-btn" onClick={() => viewDetails(gem)}>
                                <span className="side-panel-icon-btn-icon">ℹ️</span>
                                <span className="side-panel-icon-btn-label">
                                    {gem.source === "attraction" ? "Search" : "Details"}
                                </span>
                            </button>
                            {gem.source === "database" && (
                                <button className="side-panel-icon-btn" onClick={() => viewStories(gem)}>
                                    <span className="side-panel-icon-btn-icon">📖</span>
                                    <span className="side-panel-icon-btn-label">Stories</span>
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
                                                {trip.trip_name}
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
                                <span className="side-panel-info-label">Address</span>
                                <p>{gem.address}</p>
                            </div>
                        )}

                        {gem.openingHours && (
                            <div className="side-panel-info-row">
                                <span className="side-panel-info-label">Hours</span>
                                <p>{gem.openingHours}</p>
                            </div>
                        )}

                        {gem.phone && (
                            <div className="side-panel-info-row">
                                <span className="side-panel-info-label">Phone</span>
                                <p><a href={`tel:${gem.phone}`}>{gem.phone}</a></p>
                            </div>
                        )}

                        {gem.website && (
                            <div className="side-panel-info-row">
                                <span className="side-panel-info-label">Website</span>
                                <p><a href={gem.website} target="_blank" rel="noopener noreferrer">{gem.website}</a></p>
                            </div>
                        )}

                        {gem.source === "database" && status === "pending_community_vote" && gem.voteCount != null && (
                            <div className="side-panel-vote">
                                <span>{gem.voteCount} of {gem.verificationThreshold ?? 10} votes toward Hidden Gem status</span>
                                <div className="side-panel-vote-bar">
                                    <div className="side-panel-vote-fill" style={{ width: `${Math.min(100, (gem.voteCount / (gem.verificationThreshold ?? 10)) * 100)}%` }} />
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
                                            <GemImage src={g.image} alt={g.title} />
                                            <div>
                                                <strong>{g.title}</strong>
                                                <p>{g.category}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Reviews are the votes left when someone verifies/visits this gem */}
                        {gem.source === "database" && (
                            <div className="side-panel-reviews">
                                <div className="side-panel-reviews-header">
                                    <h3>Reviews ({reviews.length})</h3>
                                    <button
                                        type="button"
                                        className="side-panel-reviews-see-all"
                                        onClick={() => navigate(`/hidden-gems/${gem.id}`, { state: { openTab: "votes" } })}
                                    >
                                        See all
                                    </button>
                                </div>
                                {reviewsLoading && <p className="side-panel-nearby-status">Loading reviews…</p>}
                                {!reviewsLoading && reviews.length === 0 && (
                                    <p className="side-panel-nearby-status">No reviews yet.</p>
                                )}
                                {!reviewsLoading && reviews.length > 0 && (
                                    <div className="side-panel-review-list">
                                        {reviews.slice(0, 3).map((review) => (
                                            <div key={review.id} className="side-panel-review-item">
                                                <div className="side-panel-review-header">
                                                    <strong>{review.user?.name || "Anonymous"}</strong>
                                                    <span>
                                                        {new Date(review.created_at).toLocaleDateString("en-GB", {
                                                            day: "numeric", month: "short",
                                                        })}
                                                    </span>
                                                </div>
                                                {review.photo_path && (
                                                    <img
                                                        src={getVotePhotoUrl(review.photo_path)}
                                                        alt="Review"
                                                        className="side-panel-review-photo"
                                                        onError={(e) => { e.target.style.display = "none"; }}
                                                    />
                                                )}
                                                {review.travel_description && (
                                                    <p className="side-panel-review-text">"{review.travel_description}"</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                        Logout
                    </button>
                </div>
            )}

            {!isFullscreen && (
                <div
                    className="side-panel-resize-handle"
                    onMouseDown={() => setIsResizing(true)}
                />
            )}

            {gem && (
                <ReportModal
                    locationId={gem.id}
                    isOpen={reportModalOpen}
                    onClose={() => setReportModalOpen(false)}
                    onReportSuccess={() => setLocalReportStatus("under_review")}
                />
            )}
            {gem && (
                <VerifyReportModal
                    report={activeReport}
                    isOpen={verifyModalOpen}
                    onClose={() => setVerifyModalOpen(false)}
                    onVerifySuccess={(data) => {
                        if (data?.location?.report_status !== undefined) {
                            setLocalReportStatus(data.location.report_status);
                        }
                        if (data?.location?.status !== undefined) {
                            setLocalStatus(data.location.status);
                        }
                        setActiveReport(data?.report ?? null);
                    }}
                />
            )}
        </div>
    );
}

export default SidePanel;
