import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import L from "leaflet";
import { useCompare } from "../context/CompareContext";
import { getHiddenGemDetail } from "../api/hiddenGems";
import { getTripItineraries, addTripLocation } from "../api/TripItinerary";
import { getMenuItems } from "../api/menuItems";
import { toCompareGem } from "../utils/compareGem";
import { getGemStatusDisplay } from "../utils/gemStatus";
import GemImage from "../components/GemImage";
import TruncatedText from "../components/TruncatedText";

import "../styles/global.css";

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

export default function CompareGems() {
    const { items, removeCompare } = useCompare();
    const location = useLocation();
    const navigate = useNavigate();

    const urlIds = useMemo(() => {
        const raw = new URLSearchParams(location.search).get("ids");
        return raw ? raw.split(",").filter(Boolean) : null;
    }, [location.search]);

    const [fetched, setFetched] = useState({});
    const [missing, setMissing] = useState([]);
    const [itineraries, setItineraries] = useState([]);
    const [itineraryOpenId, setItineraryOpenId] = useState(null);
    const [itineraryStatusById, setItineraryStatusById] = useState({});
    const [menuItemsByGemId, setMenuItemsByGemId] = useState({});
    const [userPosition, setUserPosition] = useState(null);

    useEffect(() => {
        getTripItineraries()
            .then((res) => setItineraries(res.data || []))
            .catch((err) => console.log(err));
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserPosition([pos.coords.latitude, pos.coords.longitude]),
            () => {} // distance is a nice-to-have here, not worth surfacing an error for
        );
    }, []);

    useEffect(() => {
        const ids = urlIds || items.map((g) => String(g.id));
        const numericIds = ids.filter((id) => /^\d+$/.test(id) && !fetched[id]);
        const nonNumericMissing = ids.filter((id) => !/^\d+$/.test(id) && !items.some((g) => String(g.id) === id));

        if (nonNumericMissing.length > 0) {
            setMissing((prev) => Array.from(new Set([...prev, ...nonNumericMissing])));
        }

        numericIds.forEach((id) => {
            getHiddenGemDetail(id)
                .then((res) => setFetched((prev) => ({
                    ...prev,
                    [id]: { gem: toCompareGem(res.data.data), votes: res.data.data?.votes || [] },
                })))
                .catch(() => setMissing((prev) => Array.from(new Set([...prev, id]))));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlIds, items]);

    const gems = useMemo(() => {
        const ids = urlIds || items.map((g) => String(g.id));
        return ids
            .map((id) => fetched[id]?.gem || items.find((g) => String(g.id) === id))
            .filter(Boolean)
            .map((gem) => {
                if (gem.source !== "database" || !userPosition) return gem;
                const distanceKm = L.latLng(userPosition)
                    .distanceTo(L.latLng(Number(gem.latitude), Number(gem.longitude))) / 1000;
                return { ...gem, distanceKm };
            });
    }, [urlIds, items, fetched, userPosition]);

    const reviewsByGemId = useMemo(() => {
        const map = {};
        gems.forEach((g) => {
            if (g.source === "database" && fetched[g.id]) {
                map[g.id] = fetched[g.id].votes;
            }
        });
        return map;
    }, [gems, fetched]);

    useEffect(() => {
        gems
            .filter((g) => g.source === "database" && menuItemsByGemId[g.id] === undefined)
            .forEach((g) => {
                getMenuItems(g.id)
                    .then((res) => setMenuItemsByGemId((prev) => ({ ...prev, [g.id]: res.data.data || [] })))
                    .catch(() => setMenuItemsByGemId((prev) => ({ ...prev, [g.id]: [] })));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gems]);

    useEffect(() => {
        if (!urlIds && items.length > 0) {
            navigate(`/compare?ids=${items.map((g) => g.id).join(",")}`, { replace: true });
        }
    }, [urlIds, items, navigate]);

    function openGoogleMaps(g) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`, "_blank");
    }
    function openWaze(g) {
        window.open(`https://www.waze.com/ul?ll=${g.latitude},${g.longitude}&navigate=yes`, "_blank");
    }
    function openGemLink(g) {
        if (g.source === "attraction") {
            const query = encodeURIComponent([g.title, g.address].filter(Boolean).join(" "));
            window.open(`https://www.google.com/search?q=${query}`, "_blank");
        } else {
            navigate(`/hidden-gems/${g.id}`);
        }
    }

    // Same eligibility rule as the map's side panel: the backend only accepts
    // publicly-visible gems (or OSM attractions) as itinerary stops.
    function canAddToItinerary(g) {
        return g.source === "attraction" || g.status === "hidden_gem" || g.status === "pending_community_vote";
    }

    async function handleAddToItinerary(trip, gem) {
        setItineraryStatusById((prev) => ({
            ...prev,
            [gem.id]: { type: "loading", message: `Adding to "${trip.trip_name}"…` },
        }));
        try {
            const payload = gem.source === "database"
                ? { source: "database", location_id: gem.id }
                : {
                    source: "openstreetmap",
                    osm_id: gem.osmId,
                    osm_name: gem.title,
                    latitude: gem.latitude,
                    longitude: gem.longitude,
                };
            await addTripLocation(trip.id, payload);
            setItineraryStatusById((prev) => ({
                ...prev,
                [gem.id]: { type: "success", message: `Added to "${trip.trip_name}".` },
            }));
            setItineraryOpenId(null);
        } catch (error) {
            setItineraryStatusById((prev) => ({
                ...prev,
                [gem.id]: { type: "error", message: error?.response?.data?.message || "Could not add this stop." },
            }));
        }
    }

    return (
        <div className="compare-page">
            <div className="compare-page-header">
                <h1>Compare Gems</h1>
            </div>

            {gems.length === 0 && missing.length === 0 && (
                <div className="compare-page-empty">
                    <p>Nothing to compare yet. Add gems to compare from the Map or the Hidden Gems page.</p>
                </div>
            )}

            {gems.length > 0 && (
                <div className="compare-grid">
                    {gems.map((gem) => {
                        const statusDisplay = gem.source === "database" ? getGemStatusDisplay(gem) : null;
                        return (
                            <div key={gem.id} className="compare-card">
                                <button
                                    type="button"
                                    className="compare-card-remove"
                                    onClick={() => removeCompare(gem.id)}
                                    aria-label={`Remove ${gem.title} from comparison`}
                                >
                                    ✕
                                </button>

                                <GemImage src={gem.image} alt={gem.title} className="compare-card-image" />
                                <h2>{gem.title}</h2>

                                <div className="compare-card-row">
                                    <span className="compare-card-label">Category</span>
                                    <span>{gem.category || gem.attractionType?.replace(/_/g, " ") || "—"}</span>
                                </div>

                                <div className="compare-card-row">
                                    <span className="compare-card-label">Status</span>
                                    <span>
                                        {gem.source === "attraction"
                                            ? <span className="hidden-gems-card-pending">OpenStreetMap attraction</span>
                                            : <span className={statusDisplay.badgeClass}>{statusDisplay.label}</span>}
                                    </span>
                                </div>

                                {gem.state && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">State</span>
                                        <span>{gem.state}</span>
                                    </div>
                                )}

                                {gem.source === "database" && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Rating</span>
                                        <span>
                                            {gem.ratingCount > 0
                                                ? <>★ {gem.ratingAvg?.toFixed(1)} <span className="compare-card-muted">({gem.ratingCount})</span></>
                                                : <span className="compare-card-muted">No ratings yet</span>}
                                        </span>
                                    </div>
                                )}

                                {gem.source === "database" && gem.checkInsCount > 0 && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Check-ins</span>
                                        <span>{gem.checkInsCount}</span>
                                    </div>
                                )}

                                {gem.distanceKm != null && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Distance</span>
                                        <span>{gem.distanceKm < 1 ? `${Math.round(gem.distanceKm * 1000)}m away` : `${gem.distanceKm.toFixed(1)}km away`}</span>
                                    </div>
                                )}

                                <div className="compare-card-row">
                                    <span className="compare-card-label">Address</span>
                                    <span>{gem.address || "—"}</span>
                                </div>

                                <div className="compare-card-row">
                                    <span className="compare-card-label">Description</span>
                                    <span><TruncatedText text={gem.description || "No description available."} limit={100} /></span>
                                </div>

                                {gem.source === "database" && gem.status === "pending_community_vote" && gem.voteCount != null && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Votes</span>
                                        <span>{gem.voteCount} of {gem.verificationThreshold ?? 10}</span>
                                    </div>
                                )}

                                {gem.openingHours && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Hours</span>
                                        <span>{gem.openingHours}</span>
                                    </div>
                                )}

                                {gem.phone && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Phone</span>
                                        <span><a href={`tel:${gem.phone}`}>{gem.phone}</a></span>
                                    </div>
                                )}

                                {gem.website && (
                                    <div className="compare-card-row">
                                        <span className="compare-card-label">Website</span>
                                        <span><a href={gem.website} target="_blank" rel="noopener noreferrer">{gem.website}</a></span>
                                    </div>
                                )}

                                {gem.source === "database" && gem.category === "Food & Beverage" && (() => {
                                    const menuItems = menuItemsByGemId[gem.id];
                                    const topItems = menuItems?.slice(0, 3) || [];
                                    return (
                                        <div className="compare-card-row">
                                            <span className="compare-card-label">Popular items</span>
                                            {menuItems === undefined && <span className="compare-card-muted">Loading…</span>}
                                            {menuItems && topItems.length === 0 && <span className="compare-card-muted">None suggested yet</span>}
                                            {topItems.length > 0 && (
                                                <ul className="compare-card-menu-items">
                                                    {topItems.map((item) => (
                                                        <li key={item.id}>
                                                            {item.name}
                                                            {item.price != null && ` (RM ${Number(item.price).toFixed(2)})`}
                                                            {" — 👍 "}{item.like_count}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    );
                                })()}

                                {gem.source === "database" && (() => {
                                    const reviews = reviewsByGemId[gem.id];
                                    return (
                                        <div className="side-panel-reviews">
                                            <div className="side-panel-reviews-header">
                                                <h3>Reviews ({reviews?.length ?? 0})</h3>
                                            </div>
                                            {reviews === undefined && (
                                                <p className="side-panel-nearby-status">Loading reviews…</p>
                                            )}
                                            {reviews && reviews.length === 0 && (
                                                <p className="side-panel-nearby-status">No reviews yet.</p>
                                            )}
                                            {reviews && reviews.length > 0 && (
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
                                    );
                                })()}

                                <div className="compare-card-actions">
                                    <button type="button" onClick={() => openGoogleMaps(gem)}>Directions</button>
                                    <button type="button" onClick={() => openWaze(gem)}>Waze</button>
                                    <button type="button" onClick={() => openGemLink(gem)}>
                                        {gem.source === "attraction" ? "Search" : "Details"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canAddToItinerary(gem)}
                                        title={canAddToItinerary(gem)
                                            ? "Add to a trip itinerary"
                                            : "Only gems that have passed AI review can be added to an itinerary"}
                                        onClick={() => {
                                            setItineraryStatusById((prev) => ({ ...prev, [gem.id]: null }));
                                            setItineraryOpenId((open) => (open === gem.id ? null : gem.id));
                                        }}
                                    >
                                        Itinerary
                                    </button>
                                </div>

                                {itineraryOpenId === gem.id && (
                                    <div className="side-panel-itinerary-picker compare-card-itinerary-picker">
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
                                                        onClick={() => handleAddToItinerary(trip, gem)}
                                                    >
                                                        {trip.trip_name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}

                                {itineraryStatusById[gem.id] && (
                                    <p className={`side-panel-itinerary-status ${itineraryStatusById[gem.id].type}`}>
                                        {itineraryStatusById[gem.id].message}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {missing.length > 0 && (
                <p className="compare-page-missing">
                    {missing.length} item{missing.length > 1 ? "s" : ""} in this link couldn't be loaded — it may
                    have been an OpenStreetMap place from someone else's session, or no longer exists.
                </p>
            )}
        </div>
    );
}
