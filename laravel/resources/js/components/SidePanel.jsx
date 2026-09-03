import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";
import GemImage from "./GemImage";
import PhotoCarousel from "./PhotoCarousel";
import Spinner from "./Spinner";
import Avatar from "./Avatar";
import TruncatedText from "./TruncatedText";
import ReportModal from "./ReportModal";
import VerifyReportModal from "./VerifyReportModal";
import SignInPrompt from "./SignInPrompt";
import { useCompare } from "../context/CompareContext";
import { getReportForLocation } from "../api/reports";
import { createTripItinerary } from "../api/TripItinerary";

// Backend caps trip_name at 10 characters (TripItineraryController::store).
const ITINERARY_NAME_MAX = 10;

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
    itineraries = [], itinerariesLoading = false, onAddToItinerary, onItineraryCreated,
    wishlistIds = new Set(), onToggleWishlist,
    reviews = [], reviewsLoading = false,
    images = [],
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [width, setWidth] = useState(340);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [itineraryOpen, setItineraryOpen] = useState(false);
    const [itineraryStatus, setItineraryStatus] = useState(null);
    const [showItineraryForm, setShowItineraryForm] = useState(false);
    const [newItineraryName, setNewItineraryName] = useState("");
    const [creatingItinerary, setCreatingItinerary] = useState(false);
    const [wishlistBusy, setWishlistBusy] = useState(false);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [activeReport, setActiveReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [localReportStatus, setLocalReportStatus] = useState(null);
    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");

    const [localStatus, setLocalStatus] = useState(null);
    const bodyRef = useRef(null);
    const panelRef = useRef(null);
    const navigate = useNavigate();
    const { isComparing, toggleCompare, canAddMore, maxCompare, clearCompare } = useCompare();

    // A new selection always lands on the first post's detail view, and resets
    // any scroll from the previously-shown gem.
    useEffect(() => {
        setActiveIndex(0);
        setIsFullscreen(false);
        setItineraryOpen(false);
        setItineraryStatus(null);
        setShowItineraryForm(false);
        setNewItineraryName("");
        setLocalReportStatus(null);
        setLocalStatus(null);
        bodyRef.current?.scrollTo({ top: 0 });
    }, [group]);

    const gem = group && group.length > 0 ? group[activeIndex] ?? group[0] : null;
    const reportStatus = localReportStatus ?? gem?.reportStatus;
    const status = localStatus ?? gem?.status;

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

    // Close the navigation panel when the user interacts outside it.
    // Keep embedded gem-detail mode unchanged so map interactions do not
    // unintentionally dismiss the currently selected gem.
    useEffect(() => {
        if (!isOpen || mode !== "nav") {
            return;
        }

        function isOutsidePanel(target) {
            return (
                panelRef.current &&
                target instanceof Node &&
                !panelRef.current.contains(target)
            );
        }

        function handlePointerDown(event) {
            if (isOutsidePanel(event.target)) {
                onClose();
            }
        }

        function handleWheel(event) {
            if (isOutsidePanel(event.target)) {
                onClose();
            }
        }

        function handleTouchMove(event) {
            if (isOutsidePanel(event.target)) {
                onClose();
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("wheel", handleWheel, { passive: true });
        document.addEventListener("touchmove", handleTouchMove, { passive: true });

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("wheel", handleWheel);
            document.removeEventListener("touchmove", handleTouchMove);
        };
    }, [isOpen, mode, onClose]);

    if (!isOpen) return null;

    const showNavChrome = mode === "nav";
    const embedded = mode === "gems";

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

    // A delisted gem whose report is "upheld" has a fix pending review
    const isDelistedAwaitingFix = gem && status === "delisted" && reportStatus === "upheld";

    const canReportOrVerify = gem
        && gem.source === "database"
        && (status === "hidden_gem" || status === "pending_community_vote" || isDelistedAwaitingFix);

    function requireSignIn(message) {
        setSignInMessage(message);
        setShowSignIn(true);
    }

    async function handleReportIconClick() {
        // Guests can see the icon (it advertises the feature) but reporting
        // and verifying both require an account — skip the API round-trip
        // entirely and point them at sign-in.
        const isPending = reportStatus === "under_review" || isDelistedAwaitingFix;
        if (!user) {
            requireSignIn(isPending
                ? "Login to help verify this report."
                : "Login to report a problem with this gem.");
            return;
        }
        if (!isPending) {
            setReportModalOpen(true);
            return;
        }
        setLoadingReport(true);
        try {
            const res = await getReportForLocation(gem.id);
            setActiveReport(res.data.data);
            setVerifyModalOpen(true);
        } catch (error) {
            console.error("Error checking report status:", error);
        } finally {
            setLoadingReport(false);
        }
    }

    async function handleAddToItinerary(itinerary) {
        setItineraryStatus({ type: "loading", message: `Adding to "${itinerary.trip_name}"…` });
        try {
            await onAddToItinerary(itinerary, gem);
            setItineraryStatus({ type: "success", message: `Added to "${itinerary.trip_name}".` });
            setItineraryOpen(false);
            setShowItineraryForm(false);
            setNewItineraryName("");
        } catch (error) {
            setItineraryStatus({
                type: "error",
                message: error?.response?.data?.message || "Could not add this stop.",
            });
        }
    }

    async function handleCreateItineraryAndAdd() {
        const name = newItineraryName.trim();
        if (!name || creatingItinerary) return;

        setCreatingItinerary(true);
        setItineraryStatus({ type: "loading", message: `Creating "${name}"…` });
        try {
            const res = await createTripItinerary({ trip_name: name });
            const newTrip = res.data?.data;
            onItineraryCreated?.(newTrip);
            await handleAddToItinerary(newTrip);
        } catch (error) {
            setItineraryStatus({
                type: "error",
                message: error?.response?.data?.message || "Could not create the itinerary.",
            });
        } finally {
            setCreatingItinerary(false);
        }
    }

    async function handleToggleWishlist() {
        if (!gem || wishlistBusy) return;
        if (!user) {
            requireSignIn("Login to save gems to your wishlist.");
            return;
        }
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
        clearCompare();
        onClose();
        navigate('/login');
    };

    const menuItems = [
        { to: '/my-hidden-gems', label: 'My Hidden Gems', signInMessage: 'Login to manage your hidden gems and contributions.' },
        { to: '/hidden-gems', label: 'Hidden Gems' },
        { to: '/trip-itinerary', label: 'Trip Itinerary', signInMessage: 'Login to view and plan your trips.' },
        { to: '/travel-posts', label: 'Travel Posts' },
        { to: '/map', label: 'Map' },
    ];

    return (
        <div
            ref={panelRef}
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
            </div>

            {headerExtra && (
                <div className="side-panel-search">
                    {headerExtra}
                </div>
            )}

            {showNavChrome && (user ? (
                <div className="side-panel-user">
                    <Avatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
                    <div className="side-panel-user-info">
                        <p className="side-panel-user-name">{user.name || 'User'}</p>
                        <p className="side-panel-user-email">{user.email || ''}</p>
                    </div>
                </div>
            ) : (
                <div className="side-panel-guest">
                    <Link to="/login" className="side-panel-guest-login" onClick={onClose}>Login</Link>
                    <Link to="/register" className="side-panel-guest-register" onClick={onClose}>Sign Up</Link>
                </div>
            ))}

            {showNavChrome && (
                <nav className="side-panel-nav">
                    {menuItems.map(({ to, label, signInMessage: navSignInMessage }) => (
                        <Link
                            key={to}
                            to={to}
                            className="side-panel-nav-item"
                            onClick={(event) => {
                                if (!user && navSignInMessage) {
                                    event.preventDefault();
                                    requireSignIn(navSignInMessage);
                                    return;
                                }
                                onClose();
                            }}
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
                            {images && images.length > 0 ? (
                                <PhotoCarousel
                                    images={images}
                                    alt={gem.title}
                                    showThumbs={false}
                                    className="side-panel-carousel"
                                />
                            ) : (
                                <GemImage src={gem.image} alt={gem.title} className="side-panel-gem-image" />
                            )}
                            <div className="side-panel-badges">
                                {gem.category && <span className="badge badge-neutral">{gem.category}</span>}
                                {gem.attractionType && (
                                    <span className="badge badge-neutral">{gem.attractionType.replace(/_/g, " ")}</span>
                                )}
                                {gem.source === "database" && status === "hidden_gem" && (
                                    <span className="badge badge-success">Hidden Gem</span>
                                )}
                                {gem.source === "database" && status === "pending_community_vote" && (
                                    <span className="badge badge-pending">Awaiting Votes</span>
                                )}
                                {gem.source === "database" && status === "ai_rejected" && (
                                    <span className="badge badge-pending">Not Accepted</span>
                                )}
                                {gem.source === "database" && status === "delisted" && (
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
                                {canReportOrVerify && (
                                    <button
                                        type="button"
                                        className="report-toggle-btn"
                                        onClick={handleReportIconClick}
                                        disabled={loadingReport}
                                        title={reportStatus === "under_review"
                                            ? "Help verify a reported problem with this gem"
                                            : isDelistedAwaitingFix
                                                ? "Help verify the owner's fix for this gem"
                                                : "Report a problem with this gem"}
                                    >
                                        ⚠
                                    </button>
                                )}
                            </div>
                        </div>
                        {gem.source === "database" && (reportStatus === "under_review" || isDelistedAwaitingFix) && Number(gem.user_id) !== Number(user?.id) && (
                            <div className="report-banner">
                                <div className="report-banner-text">
                                    {isDelistedAwaitingFix ? (
                                        <>
                                            <strong>This gem was delisted — a fix is pending review</strong>
                                            <p>If you've visited recently, help the community verify whether the fix resolves the issue.</p>
                                        </>
                                    ) : (
                                        <>
                                            <strong>This gem has a report under review</strong>
                                            <p>If you've visited recently, help the community verify whether the issue is real.</p>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="report-banner-verify-btn"
                                    onClick={handleReportIconClick}
                                    disabled={loadingReport}
                                >
                                    {loadingReport ? "Loading…" : "Help Verify"}
                                </button>
                            </div>
                        )}

                        {gem.state && <p className="side-panel-gem-meta">{gem.state}</p>}
                        {gem.source === "database" && (gem.ratingCount > 0 || gem.checkInsCount > 0 || gem.distanceKm != null) && (
                            <div className="side-panel-stats-row">
                                {gem.ratingCount > 0 && (
                                    <span className="side-panel-stat">★ {gem.ratingAvg?.toFixed(1)} <em>({gem.ratingCount})</em></span>
                                )}
                                {gem.distanceKm != null && (
                                    <span className="side-panel-stat">
                                        📍 {gem.distanceKm < 1 ? `${Math.round(gem.distanceKm * 1000)}m away` : `${gem.distanceKm.toFixed(1)}km away`}
                                    </span>
                                )}
                                {gem.checkInsCount > 0 && (
                                    <span className="side-panel-stat">✓ {gem.checkInsCount} check-in{gem.checkInsCount > 1 ? "s" : ""}</span>
                                )}
                            </div>
                        )}
                        <p className="side-panel-gem-desc">
                            <TruncatedText text={gem.description || "No description available."} limit={100} />
                        </p>

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
                                onClick={() => {
                                    if (!user) {
                                        requireSignIn("Login to add gems to a trip itinerary.");
                                        return;
                                    }
                                    setItineraryStatus(null);
                                    setShowItineraryForm(false);
                                    setNewItineraryName("");
                                    setItineraryOpen(o => !o);
                                }}
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
                                {itinerariesLoading && (
                                    <Spinner size="sm" inline label="Loading itineraries…" />
                                )}

                                {!itinerariesLoading && itineraries.length > 0 && (
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

                                {!itinerariesLoading && (showItineraryForm ? (
                                    <form
                                        className="side-panel-itinerary-create"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            handleCreateItineraryAndAdd();
                                        }}
                                    >
                                        <input
                                            type="text"
                                            className="side-panel-itinerary-create-input"
                                            placeholder="New trip name"
                                            maxLength={ITINERARY_NAME_MAX}
                                            value={newItineraryName}
                                            onChange={(event) => setNewItineraryName(event.target.value)}
                                            autoFocus
                                        />
                                        <div className="side-panel-itinerary-create-actions">
                                            <button
                                                type="button"
                                                className="side-panel-itinerary-create-cancel"
                                                onClick={() => {
                                                    setShowItineraryForm(false);
                                                    setNewItineraryName("");
                                                }}
                                                disabled={creatingItinerary}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="side-panel-itinerary-create-submit"
                                                disabled={!newItineraryName.trim() || creatingItinerary}
                                            >
                                                Create &amp; add
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        className="side-panel-itinerary-option side-panel-itinerary-new"
                                        onClick={() => {
                                            setItineraryStatus(null);
                                            setShowItineraryForm(true);
                                        }}
                                    >
                                        ＋ New itinerary
                                    </button>
                                ))}
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
                                {reviewsLoading && <Spinner size="sm" inline label="Loading reviews…" />}
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
                                {nearbyLoading && <Spinner size="sm" inline label="Loading nearby spots…" />}
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
                                                    <p>{place.source === "database" ? "Hidden gem" : place.type.replace(/_/g, " ")} · {place.distance}m away</p>
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
            {showNavChrome && user && (
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
            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={signInMessage}
            />
        </div>
    );
}

export default SidePanel;
