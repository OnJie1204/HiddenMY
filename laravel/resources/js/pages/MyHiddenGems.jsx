import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyHiddenGems } from "../api/hiddenGems";

import "../styles/global.css";

export default function MyHiddenGems() {
    const navigate = useNavigate();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchMyHiddenGems = async () => {
        setLoading(true);

        try {
            const response = await getMyHiddenGems();

            console.log("My Hidden Gems API Response:", response.data);

            setGems(response.data.data || []);
        } catch (error) {
            console.error("Error fetching my hidden gems:", error);

            setError(
                error.response?.data?.message ||
                "Failed to load your hidden gems."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMyHiddenGems();
    }, []);

    return (
        <div className="hidden-gems-page">

            <div className="hidden-gems-header">
                <div>
                    <h1>💎 My Hidden Gems</h1>
                    <p>Manage the hidden gems you have submitted.</p>
                </div>

                <button
                    className="hidden-gems-submit-btn"
                    onClick={() => navigate("/hidden-gems/create")}
                >
                    + Hidden Gem
                </button>
            </div>

            {loading ? (
                <div className="hidden-gems-loading">
                    <p>Loading your hidden gems...</p>
                </div>

            ) : error ? (
                <div className="hidden-gems-empty">
                    <p>{error}</p>
                </div>

            ) : gems.length === 0 ? (

                <div className="hidden-gems-empty">
                    <h2>No Hidden Gems Yet</h2>
                    <p>
                        You have not submitted any hidden gems yet.
                    </p>

                    <button
                        className="hidden-gems-submit-btn"
                        onClick={() => navigate("/hidden-gems/create")}
                    >
                        Submit Your First Hidden Gem
                    </button>
                </div>

            ) : (

                <div className="hidden-gems-list">

                    {gems.map((gem) => (
                        <div
                            className="hidden-gems-card"
                            key={gem.id}
                        >
                            <div className="hidden-gems-card-image">
                                {gem.images && gem.images.length > 0 ? (
                                    <img
                                        src={gem.images[0].image_url}
                                        alt={gem.place_name}
                                    />
                                ) : (
                                    <div className="hidden-gems-card-no-image">
                                        No Image
                                    </div>
                                )}
                            </div>

                            <div className="hidden-gems-card-content">

                                <h2>{gem.place_name}</h2>

                                <div className="hidden-gems-card-tags">

                                    <span className="hidden-gems-card-category">
                                        {gem.category?.name || "Uncategorized"}
                                    </span>

                                    <span className="hidden-gems-card-state">
                                        {gem.state || "Unknown"}
                                    </span>

                                </div>

                                <p className="hidden-gems-card-description">
                                    {gem.description || "No description"}
                                </p>

                                <div className="hidden-gems-card-status">
                                    {gem.status === "verified" ? (
                                        <span className="hidden-gems-card-verified">
                                            Verified
                                        </span>
                                    ) : gem.status === "rejected" ? (
                                        <span
                                            className="hidden-gems-card-rejected"
                                            title={gem.ai_review_reason || ""}
                                        >
                                            Rejected
                                            {gem.ai_review_reason
                                                ? `: ${gem.ai_review_reason}`
                                                : ""}
                                        </span>
                                    ) : (
                                        <span className="hidden-gems-card-pending">
                                            Pending (
                                            {gem.vote_count || 0}/
                                            {gem.verification_threshold || 10}
                                            votes)
                                        </span>
                                    )}
                                </div>

                                <div className="my-hidden-gems-actions">

                                    <button
                                        className="my-hidden-gems-edit-btn"
                                        onClick={() =>
                                            navigate(`/my-hidden-gems/edit/${gem.id}`)
                                        }
                                    >
                                        Edit
                                    </button>

                                    <button
                                        className="my-hidden-gems-delete-btn"
                                        onClick={() => {
                                            console.log(
                                                "Delete hidden gem:",
                                                gem.id
                                            );
                                        }}
                                    >
                                        Delete
                                    </button>

                                </div>

                            </div>
                        </div>
                    ))}

                </div>
            )}

        </div>
    );
}
