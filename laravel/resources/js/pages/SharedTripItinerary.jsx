import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSharedTripItinerary, copyTripItinerary } from "../api/TripItinerary";
import { cartoTileUrl } from "../utils/cartoTiles";
import Spinner from "../components/Spinner";
import "../styles/global.css";

const stopIcon = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24],
});

const stopIconClosed = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24],
    className: "gem-marker-closed",
});

const MALAYSIA_CENTER = [4.2105, 101.9758];

function stopStatusLabel(stop) {
    if (!stop.is_hidden) return "Tourist attraction";
    if (!stop.gem) return "Removed";
    if (stop.gem.permanently_closed_at) return "Permanently closed";
    if (stop.gem.status === "pending_community_vote") return "Awaiting community votes";
    if (stop.gem.status === "hidden_gem") return "Hidden Gem";
    if (!stop.gem.is_visible) return "No longer available";
    return null;
}

export default function SharedTripItinerary() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        getSharedTripItinerary(id)
            .then((res) => {
                if (!cancelled) setTrip(res.data?.data ?? null);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err?.response?.status === 403
                    ? "This trip isn't shared. Only trips attached to a published story can be viewed."
                    : "Couldn't load this trip.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [id]);

    const mapStops = useMemo(
        () => (trip?.stops ?? []).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)),
        [trip],
    );

    const handleCopy = async () => {
        setCopying(true);
        setCopyError("");
        try {
            const res = await copyTripItinerary(id);
            const newId = res.data?.data?.id;
            navigate(newId ? `/trip-itinerary/${newId}` : "/trip-itinerary", {
                state: { copiedFrom: trip?.trip_name },
            });
        } catch (err) {
            setCopyError(err?.response?.data?.message || "Couldn't copy this trip.");
        } finally {
            setCopying(false);
        }
    };

    if (loading) {
        return (
            <div className="trip-detail-container">
                <Spinner label="Loading trip…" />
            </div>
        );
    }

    if (error || !trip) {
        return (
            <div className="trip-detail-container">
                <p className="gem-detail-error">{error || "Trip not found."}</p>
                <Link to="/travel-posts" className="gem-detail-back-link">← Back to stories</Link>
            </div>
        );
    }

    return (
        <div className="trip-detail-container shared-trip">
            <div className="trip-detail-header">
                <div>
                    <h1 className="trip-detail-title">{trip.trip_name}</h1>
                    <p className="travel-post-byline-meta">
                        {trip.owner_name ? `Shared by ${trip.owner_name}` : "Shared trip"} · read-only
                    </p>
                </div>
                <div className="shared-trip-actions">
                    {trip.is_owner ? (
                        <Link to={`/trip-itinerary/${trip.id}`} className="vote-btn-primary">Open in editor</Link>
                    ) : (
                        <button
                            type="button"
                            className="vote-btn-primary"
                            onClick={handleCopy}
                            disabled={copying}
                        >
                            {copying ? "Copying…" : "Copy this trip to my itineraries"}
                        </button>
                    )}
                </div>
            </div>

            {copyError && <p className="vote-message error">{copyError}</p>}

            {trip.stops.length === 0 ? (
                <p className="trip-location-order-status">This trip has no stopping points yet.</p>
            ) : (
                <>
                    {mapStops.length > 0 && (
                        <div className="shared-trip-map">
                            <MapContainer
                                bounds={mapStops.length > 1 ? mapStops.map((s) => [s.latitude, s.longitude]) : undefined}
                                center={mapStops.length === 1 ? [mapStops[0].latitude, mapStops[0].longitude] : MALAYSIA_CENTER}
                                zoom={mapStops.length === 1 ? 13 : 7}
                                style={{ width: "100%", height: "320px", borderRadius: "12px" }}
                                scrollWheelZoom={false}
                            >
                                <TileLayer
                                    url={cartoTileUrl("rastertiles/voyager")}
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                <Polyline positions={mapStops.map((s) => [s.latitude, s.longitude])} color="#2563EB" weight={3} dashArray="6 8" />
                                {mapStops.map((s, i) => (
                                    <Marker
                                        key={s.id}
                                        position={[s.latitude, s.longitude]}
                                        icon={s.gem?.permanently_closed_at ? stopIconClosed : stopIcon}
                                    >
                                        <Popup>
                                            <b>{i + 1}. {s.name}</b>
                                            {stopStatusLabel(s) && <><br /><small>{stopStatusLabel(s)}</small></>}
                                        </Popup>
                                    </Marker>
                                ))}
                            </MapContainer>
                        </div>
                    )}

                    <ol className="shared-trip-stops">
                        {trip.stops.map((s, i) => {
                            const label = stopStatusLabel(s);
                            const linkable = s.is_hidden && s.gem && s.gem.is_visible;
                            const body = (
                                <>
                                    <span className="shared-trip-stop-rank">{i + 1}</span>
                                    <span className="shared-trip-stop-body">
                                        <span className="shared-trip-stop-name">{s.name}</span>
                                        <span className="shared-trip-stop-meta">
                                            {s.gem?.category && <>{s.gem.category} · </>}
                                            {s.gem?.state || (!s.is_hidden ? "OpenStreetMap" : "")}
                                        </span>
                                        {label && <span className={`shared-trip-stop-status${s.gem?.permanently_closed_at || !s.gem?.is_visible ? " is-closed" : ""}`}>{label}</span>}
                                    </span>
                                </>
                            );
                            return (
                                <li key={s.id} className={`shared-trip-stop${s.gem?.permanently_closed_at ? " gem-card-closed" : ""}`}>
                                    {linkable
                                        ? <Link to={`/hidden-gems/${s.gem.id}`} className="shared-trip-stop-link">{body}</Link>
                                        : <div className="shared-trip-stop-link">{body}</div>}
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}

            <p className="report-reason-hint" style={{ marginTop: 16 }}>
                This is a live view — if {trip.owner_name || "the owner"} changes the trip later, or a gem is
                reported or closed, it updates here too. Copying takes a snapshot of the trip as it is now
                into your own itineraries, where you can edit it freely.
            </p>
        </div>
    );
}
