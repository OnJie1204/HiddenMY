import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getHiddenGemDetail } from "../api/hiddenGems";

import "../styles/global.css";

export default function HiddenGemDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [gem, setGem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("details");

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const response = await getHiddenGemDetail(id);
                setGem(response.data.data);
            } catch (err) {
                console.error("Error fetching gem detail:", err);
                setError("Failed to load hidden gem details.");
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
    }, [id]);

    if (loading) {
        return (
            <div className="gem-detail-loading">
                <div className="gem-detail-loading-spinner"></div>
                <p>Loading hidden gem...</p>
            </div>
        );
    }

    if (error || !gem) {
        return (
            <div className="gem-detail-error">
                <p>😕 {error || "Hidden gem not found."}</p>
                <Link to="/hidden-gems" className="gem-detail-back-link">
                    ← Back to List
                </Link>
            </div>
        );
    }

    return (
        <div className="gem-detail-page">

            {/* Back Button */}
            <Link to="/hidden-gems" className="gem-detail-back-link">
                ← Back to Hidden Gems
            </Link>

            <div className="gem-detail-container">

                {/* Image Gallery */}
                <div className="gem-detail-gallery">
                    <div className="gem-detail-main-image">
                        {gem.images && gem.images.length > 0 ? (
                            <img
                                src={gem.images[0].image_url}
                                alt={gem.place_name}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = `<div class="gem-detail-main-placeholder">No Image</div>`;
                                }}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            <div className="gem-detail-main-placeholder">No Image</div>
                        )}
                    </div>
                    <div className="gem-detail-thumbnails">
                        {gem.images && gem.images.slice(1, 4).map((img, index) => (
                            <div key={index} className="gem-detail-thumbnail">
                                <img
                                    src={img.image_url}
                                    alt={`${gem.place_name} ${index + 2}`}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                        ))}
                        {gem.images && gem.images.length > 4 && (
                            <div className="gem-detail-thumbnail-more">
                                +{gem.images.length - 4}
                            </div>
                        )}
                    </div>
                </div>

                {/* Title & Meta */}
                <div className="gem-detail-header">
                    <h1 className="gem-detail-title">🌟 {gem.place_name}</h1>
                    <div className="gem-detail-meta-row">
                        <span className="gem-detail-category-tag">
                            🏷️ {gem.category?.name || "Uncategorized"}
                        </span>
                        <span className="gem-detail-location-tag">
                            📍 {gem.state || "Unknown"}
                        </span>
                    </div>
                    <div className="gem-detail-status-row">
                        {gem.status === "verified" ? (
                            <span className="gem-detail-status-verified">✅ Verified</span>
                        ) : (
                            <span className="gem-detail-status-pending">
                                ⏳ Pending ({gem.vote_count || 0}/{gem.verification_threshold || 10} votes)
                            </span>
                        )}
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="gem-detail-tabs">
                    <button
                        className={`gem-detail-tab ${activeTab === "details" ? "active" : ""}`}
                        onClick={() => setActiveTab("details")}
                    >
                        📋 Details
                    </button>
                    <button
                        className={`gem-detail-tab ${activeTab === "votes" ? "active" : ""}`}
                        onClick={() => setActiveTab("votes")}
                    >
                        🗳️ Votes ({gem.votes?.length || 0})
                    </button>
                </div>

                {/* Tab Content */}
                <div className="gem-detail-content">

                    {/* Details Tab */}
                    {activeTab === "details" && (
                        <div>

                            {/* Description */}
                            <div className="gem-detail-section">
                                <h3>💬 Description</h3>
                                <p className="gem-detail-description-text">
                                    "{gem.description || "No description available."}"
                                </p>
                            </div>

                            {/* Location */}
                            <div className="gem-detail-section">
                                <h3>📍 Location</h3>
                                <p className="gem-detail-address">
                                    {gem.address}
                                </p>
                                <p className="gem-detail-coords">
                                    {gem.latitude}, {gem.longitude}
                                </p>
                            </div>

                            {/* Vote Progress */}
                            {gem.status === "pending" && (
                                <div className="gem-detail-section">
                                    <h3>📊 Vote Progress</h3>
                                    <div className="gem-detail-progress-bar">
                                        <div 
                                            className="gem-detail-progress-fill" 
                                            style={{ width: `${Math.min((gem.vote_count / gem.verification_threshold) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <p className="gem-detail-progress-text">
                                        {gem.vote_count || 0} of {gem.verification_threshold || 10} votes
                                        ({gem.remaining_votes || 0} more needed)
                                    </p>
                                </div>
                            )}

                            {/* Submitted By */}
                            <div className="gem-detail-section">
                                <h3>👤 Discovered by</h3>
                                <p className="gem-detail-submitter">
                                    {gem.user?.name || "Unknown User"}
                                </p>
                            </div>

                            {/* Vote Button */}
                            <div className="gem-detail-vote-section">
                                {gem.status === "pending" ? (
                                    <button className="gem-detail-vote-btn">
                                        🗳️ Vote Now
                                    </button>
                                ) : (
                                    <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                        ✅ Already Verified
                                    </button>
                                )}
                            </div>

                        </div>
                    )}

                    {/* Votes Tab */}
                    {activeTab === "votes" && (
                        <div className="gem-detail-votes-list">
                            {gem.votes && gem.votes.length > 0 ? (
                                gem.votes.map((vote, index) => (
                                    <div key={index} className="gem-detail-vote-item">
                                        <div className="gem-detail-vote-avatar">
                                            {vote.user?.name?.charAt(0) || "U"}
                                        </div>
                                        <div className="gem-detail-vote-info">
                                            <p className="gem-detail-vote-user">{vote.user?.name || "Unknown User"}</p>
                                            <p className="gem-detail-vote-date">
                                                Voted on {new Date(vote.created_at).toLocaleDateString("en-GB", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric"
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="gem-detail-no-votes">No votes yet. Be the first to vote!</p>
                            )}
                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}