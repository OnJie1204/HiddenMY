import { startTransition, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginNavOptions } from "@/utils/auth/authRedirect";
import googleMapsIcon from "@/assets/navigation/google_maps.png";
import wazeIcon from "@/assets/navigation/waze.png";
import GemImage from "@/components/hidden-gems/GemImage";
import PhotoCarousel from "@/components/common/PhotoCarousel";
import Spinner from "@/components/common/Spinner";
import Avatar from "@/components/common/Avatar";
import TruncatedText from "@/components/common/TruncatedText";
import ReportModal from "@/components/community/ReportModal";
import VerifyReportModal from "@/components/community/VerifyReportModal";
import { useAuthPrompt } from "@/context/auth/AuthPromptContext";
import { getReportForLocation } from "@/features/community/reportsApi";
import { createTripItinerary } from "@/features/travel/tripItinerariesApi";

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
    resumeIntent = null, onResumeConsumed,
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
    const [activeReports, setActiveReports] = useState([]);
    const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
    const [loadingReport, setLoadingReport] = useState(false);
    const [localReportStatus, setLocalReportStatus] = useState(null);
    const [localStatus, setLocalStatus] = useState(null);
    const bodyRef = useRef(null);
    const panelRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { requireAuth, isAuthPromptOpen } = useAuthPrompt();

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

    // Resume a gem action the guest started before the login wall. Login
    // returns to /map?gemId=<id>, Maps reselects that gem, and this fires once
    // it matches. Wishlist runs outright (reversible, private); the rest just
    // re-open their UI so the user still confirms. Kept self-contained (props
    // + gem only) so it's safe to run before the `!isOpen` early return below.
    const resumeFiredRef = useRef(false);
    useEffect(() => {
        if (resumeFiredRef.current || !isOpen || !resumeIntent || !user || !gem) return;
        if (resumeIntent.gemId != null && Number(resumeIntent.gemId) !== Number(gem.id)) return;

        resumeFiredRef.current = true;
        onResumeConsumed?.();

        switch (resumeIntent.action) {
            case "wishlist":
                if (onToggleWishlist && !wishlistIds.has(gem.id)) {
                    Promise.resolve(onToggleWishlist(gem, false)).catch(() => {});
                }
                break;
            case "itinerary":
                setItineraryStatus(null);
                setShowItineraryForm(false);
                setNewItineraryName("");
                setItineraryOpen(true);
                break;
            case "report":
                setReportModalOpen(true);
                break;
            case "verify":
                handleReportIconClick();
                break;
            default:
                break;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeIntent, user, gem, isOpen]);

    useEffect(() => {
        if (!user || !gem || reportStatus !== "under_review") {
            setActiveReports([]);
            return;
        }

        let active = true;
        setActiveReports([]);

        getReportForLocation(gem.id)
            .then((res) => {
                if (active) setActiveReports(res.data.active_reports ?? []);
            })
            .catch(() => {
                if (active) setActiveReports([]);
            });

        return () => { active = false; };
    }, [gem?.id, reportStatus, user?.id, reportsRefreshKey]);

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
        // A modal (sign-in prompt, report, verify) sits on top of the panel and
        // is portaled outside panelRef — a click on it must not read as "outside"
        // and close the panel out from under the modal.
        if (!isOpen || mode !== "nav" || isAuthPromptOpen || reportModalOpen || verifyModalOpen) {
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
    }, [isOpen, mode, onClose, isAuthPromptOpen, reportModalOpen, verifyModalOpen]);

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
    // (TripItineraryController uses the publiclyVisible() scope: 'hidden_gem',
    // 'pending_community_vote' and 'well_known'), so anything still awaiting AI
    // review is blocked here rather than failing with a 422 after the fact.
    const canAddToItinerary = gem
        && (gem.source === "attraction" || status === "hidden_gem" || status === "pending_community_vote"
            || status === "well_known");

    // A permanently-closed gem is frozen — no new wishlisting or
    // reporting (see Location::acceptsNewInteractions on the backend).
    const isClosed = !!(gem && (gem.permanently_closed_at || gem.permanentlyClosedAt));

    // OSM attractions aren't Location records, so there's nothing to wishlist —
    // only our own database gems that have passed AI review qualify. Matches
    // WishlistController::WISHLISTABLE_STATUSES, which includes 'well_known'.
    const canWishlist = gem
        && gem.source === "database"
        && !isClosed
        && (status === "hidden_gem" || status === "pending_community_vote"
            || status === "well_known");
    const isWishlisted = gem && wishlistIds.has(gem.id);

    // A verified Hidden Gem, or one still in community voting (permanently_closed
    // only) — the backend enforces per-reason and returns the allowed reasons.
    const canReportOrVerify = gem
        && gem.source === "database"
        && !isClosed
        && (status === "hidden_gem" || status === "pending_community_vote");

    async function handleReportIconClick() {
        // Guests can see the icon (it advertises the feature) but reporting
        // and verifying both require an account — skip the API round-trip
        // entirely and point them at sign-in.
        const isPending = reportStatus === "under_review";
        if (!user) {
            requireAuth({
                reason: isPending ? "verifyReport" : "report",
                gemId: gem.id,
                returnTo: `/map?gemId=${gem.id}`,
            });
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
            requireAuth({
                reason: "wishlist",
                gemId: gem.id,
                returnTo: `/map?gemId=${gem.id}`,
            });
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
        onClose();
        // See the matching comment in Navbar's handleLogout: navigate() and
        // setUser() must land in the same transition, or the synchronous
        // setUser(null) commits first against the old protected route and
        // RequireAuth bounces to /login before navigate('/') takes effect.
        startTransition(() => {
            navigate('/');
            setUser(null);
        });
    };

    const menuSections = [
        {
            title: 'Discover',
            items: [
                { to: '/hidden-gems', label: 'Hidden Gems' },
                { to: '/map', label: 'Map' },
                { to: '/travel-posts', label: 'Travel Posts' },
            ],
        },
        {
            title: 'Personal',
            items: [
                { to: '/wishlist', label: 'Wishlist', authReason: 'viewWishlist' },
                { to: '/trip-itinerary', label: 'Trip Itinerary', authReason: 'planTrips' },
                { to: '/my-hidden-gems', label: 'My Hidden Gems', authReason: 'manageHiddenGems' },
            ],
        },
        {
            title: 'Account',
            items: [
                { to: '/profile', label: 'Profile', authReason: 'myProfile' },
            ],
        },
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
                    <Link to="/" className="side-panel-logo" onClick={onClose}>
                        <span className="side-panel-logo-icon">✦</span>
                        <span className="side-panel-logo-text">HiddenMY</span>
                    </Link>
                )}
                {!showNavChrome && (
                    <button
                        type="button"
                        className="side-panel-close"
                        onClick={onClose}
                        aria-label="Close location details"
                        title="Close location details"
                    >
                        ✕
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
                    <Link to="/login" replace state={loginNavOptions(location).state} className="side-panel-guest-login" onClick={onClose}>Login</Link>
                    <Link to="/register" replace state={loginNavOptions(location).state} className="side-panel-guest-register" onClick={onClose}>Sign Up</Link>
                </div>
            ))}

            {showNavChrome && (
                <nav className="side-panel-nav">
                    {menuSections.map((section, index) => (
                        <div className="side-panel-nav-section" key={section.title ?? `section-${index}`}>
                            {section.title && (
                                <p className="side-panel-nav-section-title">{section.title}</p>
                            )}
                            {section.items.map(({ to, label, authReason }) => (
                                <Link
                                    key={to}
                                    to={to}
                                    className="side-panel-nav-item"
                                    onClick={(event) => {
                                        if (!user && authReason) {
                                            event.preventDefault();
                                            requireAuth({ reason: authReason, returnTo: to });
                                            return;
                                        }
                                        onClose();
                                    }}
                                >
                                    <span className="side-panel-nav-label">{label}</span>
                                </Link>
                            ))}
                        </div>
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
                        <div className={`side-panel-gem-header${isClosed ? " gem-card-closed" : ""}`}>
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
                                    <span className="badge badge-reported">Not Accepted</span>
                                )}
                                {gem.source === "database" && status === "well_known" && (
                                    <span className="badge badge-success">Well-Known Place</span>
                                )}
                                {gem.source === "database" && (gem.permanently_closed_at || gem.permanentlyClosedAt) && (
                                    <span className="badge badge-reported">Permanently closed</span>
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
                                {canReportOrVerify && (
                                    <button
                                        type="button"
                                        className="report-toggle-btn"
                                        onClick={handleReportIconClick}
                                        disabled={loadingReport}
                                        title={reportStatus === "under_review"
                                            ? "Help verify a reported problem with this gem"
                                            : "Report a problem with this gem"}
                                    >
                                        ⚠
                                    </button>
                                )}
                            </div>
                        </div>
                        {gem.source === "database" && reportStatus === "under_review" && Number(gem.user_id) !== Number(user?.id) && (
                            user ? (
                                activeReports.map((report) => (
                                    <div className="report-banner" key={report.id}>
                                        <div className="report-banner-text">
                                            <strong>{report.reason_label || report.reason}</strong>
                                            <p>
                                                Confirm {report.confirm_count ?? 0} / {report.verification_threshold ?? 5}
                                                {" · "}
                                                Dispute {report.dispute_count ?? 0} / {report.verification_threshold ?? 5}
                                            </p>
                                        </div>
                                        {report.can_verify && (
                                            <button
                                                type="button"
                                                className="report-banner-verify-btn"
                                                onClick={() => { setActiveReport(report); setVerifyModalOpen(true); }}
                                            >
                                                Help Verify
                                            </button>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="report-banner">
                                    <div className="report-banner-text">
                                        <strong>This gem has a report under review</strong>
                                        <p>Help the community confirm or dispute it — 5 votes either way settles it.</p>
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
                            )
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
                                        requireAuth({
                                            reason: "itinerary",
                                            gemId: gem.id,
                                            returnTo: `/map?gemId=${gem.id}`,
                                        });
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


                        {/* Reviews are travellers' star ratings and comments (GemInteraction
                            type=comment) — not the community verification votes, which only
                            record who voted. "See all" opens the detail page's Ratings tab
                            so it lands on the same content this list is showing. */}
                        {gem.source === "database" && (
                            <div className="side-panel-reviews">
                                <div className="side-panel-reviews-header">
                                    <h3>Reviews ({reviews.length})</h3>
                                    <button
                                        type="button"
                                        className="side-panel-reviews-see-all"
                                        onClick={() => navigate(`/hidden-gems/${gem.id}`, { state: { openTab: "comments" } })}
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
                                                {review.rating > 0 && (
                                                    <span
                                                        className="side-panel-review-stars"
                                                        aria-label={`${review.rating} out of 5 stars`}
                                                    >
                                                        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                                                    </span>
                                                )}
                                                {review.photo_path && (
                                                    <img
                                                        src={getVotePhotoUrl(review.photo_path)}
                                                        alt="Review"
                                                        className="side-panel-review-photo"
                                                        onError={(e) => { e.target.style.display = "none"; }}
                                                    />
                                                )}
                                                {review.comment && (
                                                    <p className="side-panel-review-text">"{review.comment}"</p>
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
                    onReportSuccess={() => {
                        setLocalReportStatus("under_review");
                        setReportsRefreshKey((key) => key + 1);
                    }}
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
                        setActiveReports((reports) => reports
                            .map((report) => report.id === data?.report?.id ? data.report : report)
                            .filter((report) => report.status === "pending"));
                    }}
                    onReportInstead={() => { setVerifyModalOpen(false); setReportModalOpen(true); }}
                />
            )}
        </div>
    );
}

export default SidePanel;
