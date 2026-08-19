import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWishlist, removeFromWishlist } from "../api/wishlist";
import { getTripItineraries, addTripLocation } from "../api/TripItinerary";

import "../styles/global.css";

export default function Wishlist() {
    const navigate = useNavigate();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [itineraries, setItineraries] = useState([]);
    const [openPickerFor, setOpenPickerFor] = useState(null);
    const [actionStatus, setActionStatus] = useState(null);

    const fetchWishlist = async () => {
        setLoading(true);
        try {
            const response = await getWishlist();
            setGems(response.data.data || []);
        } catch (err) {
            console.error("Error fetching wishlist:", err);
            setError(err.response?.data?.message || "Failed to load your wishlist.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWishlist();
        getTripItineraries()
            .then((res) => setItineraries(res.data || []))
            .catch((err) => console.error("Error fetching itineraries:", err));
    }, []);

    const handleRemove = async (gem) => {
        try {
            await removeFromWishlist(gem.id);
            setGems((prev) => prev.filter((g) => g.id !== gem.id));
        } catch (err) {
            console.error("Error removing from wishlist:", err);
            setActionStatus({
                gemId: gem.id,
                type: "error",
                message: "Could not remove this from your wishlist. Please try again.",
            });
        }
    };

    const togglePicker = (gemId) => {
        setActionStatus(null);
        setOpenPickerFor((prev) => (prev === gemId ? null : gemId));
    };

    const handleAddToItinerary = async (gem, trip) => {
        setActionStatus({ gemId: gem.id, type: "loading", message: `Adding to "${trip.trip_name}"…` });
        try {
            await addTripLocation(trip.id, { source: "database", location_id: gem.id });
            setActionStatus({ gemId: gem.id, type: "success", message: `Added to "${trip.trip_name}".` });
            setOpenPickerFor(null);
        } catch (err) {
            setActionStatus({
                gemId: gem.id,
                type: "error",
                message: err.response?.data?.message || "Could not add this stop.",
            });
        }
    };

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <h1>My Wishlist</h1>
            </div>

            {loading ? (
                <div className="hidden-gems-loading">
                    <p>Loading your wishlist...</p>
                </div>
            ) : error ? (
                <div className="hidden-gems-empty">
                    <p>{error}</p>
                </div>
            ) : gems.length === 0 ? (
                <div className="hidden-gems-empty">
                    <p>You haven't saved any hidden gems yet.</p>
                    <button className="hidden-gems-submit-btn" onClick={() => navigate("/hidden-gems")}>
                        Browse Hidden Gems
                    </button>
                </div>
            ) : (
                <div className="hidden-gems-list">
                    {gems.map((gem) => (
                        <div className="hidden-gems-card wishlist-card" key={gem.id}>
                            <div
                                className="hidden-gems-card-image"
                                onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                            >
                                {gem.images && gem.images.length > 0 ? (
                                    <img
                                        src={gem.images[0].image_url}
                                        alt={gem.place_name}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.parentElement.innerHTML = `<div class="hidden-gems-card-no-image">No Image</div>`;
                                        }}
                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                ) : (
                                    <div className="hidden-gems-card-no-image">No Image</div>
                                )}
                            </div>

                            <div className="hidden-gems-card-content">
                                <div className="wishlist-card-title-row">
                                    <h2 onClick={() => navigate(`/hidden-gems/${gem.id}`)}>{gem.place_name}</h2>
                                    <button
                                        type="button"
                                        className="wishlist-remove-btn"
                                        title="Remove from wishlist"
                                        onClick={() => handleRemove(gem)}
                                    >
                                        ♥
                                    </button>
                                </div>

                                <div className="hidden-gems-card-tags">
                                    <span className="hidden-gems-card-category">
                                        {gem.category?.name || "Uncategorized"}
                                    </span>
                                    <span className="hidden-gems-card-state">{gem.state || "Unknown"}</span>
                                </div>

                                <p className="hidden-gems-card-description">
                                    {gem.description || "No description"}
                                </p>

                                <div className="wishlist-card-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => togglePicker(gem.id)}
                                    >
                                        + Add to Itinerary
                                    </button>
                                </div>

                                {openPickerFor === gem.id && (
                                    <div className="wishlist-itinerary-picker">
                                        {itineraries.length === 0 ? (
                                            <p className="wishlist-itinerary-empty">
                                                No itineraries yet —{" "}
                                                <span className="wishlist-link" onClick={() => navigate("/trip-itinerary")}>
                                                    create one
                                                </span>{" "}
                                                first.
                                            </p>
                                        ) : (
                                            itineraries.map((trip) => (
                                                <button
                                                    key={trip.id}
                                                    type="button"
                                                    className="wishlist-itinerary-option"
                                                    onClick={() => handleAddToItinerary(gem, trip)}
                                                >
                                                    {trip.trip_name}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}

                                {actionStatus?.gemId === gem.id && (
                                    <p className={`wishlist-action-status ${actionStatus.type}`}>
                                        {actionStatus.message}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
