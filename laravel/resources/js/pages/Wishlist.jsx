import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWishlist, removeFromWishlist } from "../features/users/wishlistApi";
import ReportButton from "../components/ReportButton";
import PhotoCarousel from "../components/PhotoCarousel";
import LoadingCards from "../components/LoadingCards";

import "../styles/global.css";

export default function Wishlist({ user }) {
    const navigate = useNavigate();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
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

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <h1>My Wishlist</h1>
            </div>

            {loading ? (
                <LoadingCards count={6} />
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
                        <div className={`hidden-gems-card wishlist-card${gem.permanently_closed_at ? " gem-card-closed" : ""}`} key={gem.id}>
                            <div
                                className="hidden-gems-card-image"
                                onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                            >
                                <PhotoCarousel
                                    images={gem.images || []}
                                    alt={gem.place_name}
                                    compact
                                    fill
                                    showThumbs={false}
                                />
                            </div>

                            <div className="hidden-gems-card-content">
                                <div className="wishlist-card-title-row">
                                    <h2 onClick={() => navigate(`/hidden-gems/${gem.id}`)}>{gem.place_name}</h2>
                                    <div className="hidden-gems-card-icon-actions">
                                        <button
                                            type="button"
                                            className="wishlist-remove-btn"
                                            title="Remove from wishlist"
                                            onClick={() => handleRemove(gem)}
                                        >
                                            ♥
                                        </button>
                                        <ReportButton gem={gem} user={user} />
                                    </div>
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
