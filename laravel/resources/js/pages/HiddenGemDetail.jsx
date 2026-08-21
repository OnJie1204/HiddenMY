import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { getHiddenGemDetail } from "../api/hiddenGems";
import { getMe } from "../api/auth";
import {
    updateVoteComment,
    deleteVoteComment,
    deleteVotePhoto
} from "../api/votes";
import VoteModal from "../components/VoteModal";
import { voteProgressLabel } from "../utils/gemStatus";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";
import { getTravelPostsForLocation } from "../api/travelPosts";
import { useCompare } from "../context/CompareContext";

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

export default function HiddenGemDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const [gem, setGem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState(() => {
        const openTab = routeLocation.state?.openTab;
        return openTab === "votes" || openTab === "stories" ? openTab : "details";
    });
    const [showVoteModal, setShowVoteModal] = useState(false);
    const [voteSuccess, setVoteSuccess] = useState(false);
    const [voteMessage, setVoteMessage] = useState("");
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [editingVoteId, setEditingVoteId] = useState(null);
    const [editComment, setEditComment] = useState("");
    const [voteActionMessage, setVoteActionMessage] = useState("");
    const [voteActionLoading, setVoteActionLoading] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    const [voteActionSuccess, setVoteActionSuccess] = useState("");
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistBusy, setWishlistBusy] = useState(false);
    const [wishlistError, setWishlistError] = useState("");
    const [storyPosts, setStoryPosts] = useState([]);
    const [storiesLoading, setStoriesLoading] = useState(false);
    const [storiesLoaded, setStoriesLoaded] = useState(false);
    const [storiesError, setStoriesError] = useState("");
    const { isComparing, toggleCompare, canAddMore, maxCompare } = useCompare();

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

    useEffect(() => {
        fetchDetail();
    }, [id]);

    useEffect(() => {
        getMe()
            .then((response) => setCurrentUser(response.data))
            .catch(() => setCurrentUser(null));
    }, []);

    useEffect(() => {
        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(g => g.id))))
            .catch(err => console.error("Error fetching wishlist:", err));
    }, []);

    useEffect(() => {
        if (!voteActionSuccess) return;

        const timer = setTimeout(() => setVoteActionSuccess(""), 3000);

        return () => clearTimeout(timer);
    }, [voteActionSuccess]);

    useEffect(() => {
        if (
            activeTab === "votes"
            && gem
            && routeLocation.state?.voteId
        ) {
            const voteElement = document.getElementById(
                `vote-${routeLocation.state.voteId}`
            );

            voteElement?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [activeTab, gem, routeLocation.state]);

    const handleToggleWishlist = async () => {
        if (!gem || wishlistBusy) return;

        const isWishlisted = wishlistIds.has(gem.id);
        setWishlistBusy(true);
        setWishlistError("");
        try {
            if (isWishlisted) {
                await removeFromWishlist(gem.id);
                setWishlistIds(prev => {
                    const next = new Set(prev);
                    next.delete(gem.id);
                    return next;
                });
            } else {
                await addToWishlist(gem.id);
                setWishlistIds(prev => new Set(prev).add(gem.id));
            }
        } catch (err) {
            setWishlistError(err.response?.data?.message || "Could not update your wishlist.");
        } finally {
            setWishlistBusy(false);
        }
    };

    const showStories = async () => {
        setActiveTab("stories");

        if (storiesLoaded) return;

        setStoriesLoading(true);
        setStoriesError("");

        try {
            const response = await getTravelPostsForLocation(id);
            setStoryPosts(response.data.data || []);
            setStoriesLoaded(true);
        } catch (err) {
            console.error("Error fetching travel posts for gem:", err);
            setStoriesError(err.response?.data?.message || "Failed to load community stories.");
        } finally {
            setStoriesLoading(false);
        }
    };

    // Arriving via SidePanel's "Stories" button lands directly on this tab —
    // it still needs the lazy fetch normally triggered by clicking the tab.
    useEffect(() => {
        if (routeLocation.state?.openTab === "stories") {
            showStories();
        }
    }, []);

    const handleVoteSuccess = (data) => {
        setVoteSuccess(true);
        setVoteMessage(data.message);
        fetchDetail();
        setTimeout(() => {
            setVoteSuccess(false);
            setVoteMessage("");
        }, 5000);
    };

    const updateVoteLocally = (voteId, changes) => {
        setGem((prev) => ({
            ...prev,
            votes: prev.votes.map((vote) =>
                vote.id === voteId ? { ...vote, ...changes } : vote
            ),
        }));
    };

    const handleSaveComment = async (voteId) => {
        if (!editComment.trim()) return;

        setVoteActionLoading(true);
        setVoteActionMessage("");

        try {
            await updateVoteComment(voteId, editComment.trim());
            updateVoteLocally(voteId, {
                travel_description: editComment.trim(),
            });
            setEditingVoteId(null);
            setVoteActionSuccess("Comment updated successfully.");
        } catch (error) {
            setVoteActionMessage(
                error.response?.data?.message || "Failed to update comment."
            );
        } finally {
            setVoteActionLoading(false);
        }
    };

    const handleDeleteComment = async (voteId) => {
        setVoteActionLoading(true);
        setVoteActionMessage("");

        try {
            await deleteVoteComment(voteId);
            updateVoteLocally(voteId, { travel_description: null });
            setDeleteConfirmation(null);
            setVoteActionSuccess("Comment deleted successfully.");
        } catch (error) {
            setVoteActionMessage(
                error.response?.data?.message || "Failed to delete comment."
            );
        } finally {
            setVoteActionLoading(false);
        }
    };

    const handleDeletePhoto = async (vote) => {
        setVoteActionLoading(true);
        setVoteActionMessage("");

        try {
            await deleteVotePhoto(vote.id);
            updateVoteLocally(vote.id, { photo_path: null });

            if (selectedPhoto === vote.photo_path) {
                setSelectedPhoto(null);
            }

            setDeleteConfirmation(null);
            setVoteActionSuccess("Photo deleted successfully.");
        } catch (error) {
            setVoteActionMessage(
                error.response?.data?.message || "Failed to delete photo."
            );
        } finally {
            setVoteActionLoading(false);
        }
    };

    const handleConfirmDelete = () => {
        if (deleteConfirmation?.type === "comment") {
            handleDeleteComment(deleteConfirmation.vote.id);
            return;
        }

        if (deleteConfirmation?.type === "photo") {
            handleDeletePhoto(deleteConfirmation.vote);
        }
    };

    const closeDeleteConfirmation = () => {
        if (voteActionLoading) return;

        setDeleteConfirmation(null);
        setVoteActionMessage("");
    };

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
                <p>{error || "Hidden gem not found."}</p>
                <Link to="/hidden-gems" className="gem-detail-back-link">
                    ← Back to List
                </Link>
            </div>
        );
    }

    return (
        <div className="gem-detail-page">

            {voteSuccess && (
                <div className="gem-detail-vote-success">
                    {voteMessage}
                </div>
            )}

            {voteActionSuccess && (
                <div className="hidden-gem-snackbar hidden-gem-snackbar-success">
                    {voteActionSuccess}
                </div>
            )}

            <Link
                to="/hidden-gems"
                className="gem-detail-back-link"
                onClick={(event) => {
                    event.preventDefault();
                    if (routeLocation.state?.fromMyVotes) {
                        navigate("/my-hidden-gems", {
                            state: { activeTab: "votes" },
                        });
                        return;
                    }

                    navigate(-1);
                }}
            >
                ← Back
            </Link>

            <div className="gem-detail-container">

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

                <div className="gem-detail-header">
                    <div className="gem-detail-title-row">
                        <h1 className="gem-detail-title">{gem.place_name}</h1>
                        {(gem.status === "hidden_gem" || gem.status === "pending_community_vote") && (
                            <div className="hidden-gems-card-icon-actions">
                                <button
                                    type="button"
                                    className={`gem-detail-wishlist-btn ${wishlistIds.has(gem.id) ? "active" : ""}`}
                                    onClick={handleToggleWishlist}
                                    disabled={wishlistBusy}
                                    title={wishlistIds.has(gem.id) ? "Remove from wishlist" : "Save to wishlist"}
                                >
                                    {wishlistIds.has(gem.id) ? "♥" : "♡"}
                                </button>
                                <button
                                    type="button"
                                    className={`gem-detail-wishlist-btn ${isComparing(gem.id) ? "active" : ""}`}
                                    onClick={() => toggleCompare(gem)}
                                    disabled={!isComparing(gem.id) && !canAddMore}
                                    title={isComparing(gem.id)
                                        ? "Remove from comparison"
                                        : (canAddMore ? "Add to comparison" : `You can compare up to ${maxCompare} at a time`)}
                                >
                                    {isComparing(gem.id) ? "☑" : "☐"}
                                </button>
                            </div>
                        )}
                    </div>
                    {wishlistError && <p className="gem-detail-wishlist-error">{wishlistError}</p>}
                    <div className="gem-detail-meta-row">
                        <span className="gem-detail-category-tag">
                            {gem.category?.name || "Uncategorized"}
                        </span>
                        <span className="gem-detail-location-tag">
                            {gem.state || "Unknown"}
                        </span>
                    </div>
                    <div className="gem-detail-status-row">
                        {gem.status === "hidden_gem" ? (
                            <span className="gem-detail-status-verified">Hidden Gem</span>
                        ) : gem.status === "pending_community_vote" ? (
                            <span className="gem-detail-status-pending">
                                {voteProgressLabel(gem)}
                            </span>
                        ) : gem.status === "ai_rejected" ? (
                            <span className="gem-detail-status-rejected" title={gem.ai_review_reason || ""}>
                                Not Accepted
                            </span>
                        ) : (
                            <span className="gem-detail-status-pending">
                                Being Verified by AI
                            </span>
                        )}
                    </div>
                </div>

                <div className="gem-detail-tabs">
                    <button
                        className={`gem-detail-tab ${activeTab === "details" ? "active" : ""}`}
                        onClick={() => setActiveTab("details")}
                    >
                        Details
                    </button>
                    <button
                        className={`gem-detail-tab ${activeTab === "votes" ? "active" : ""}`}
                        onClick={() => setActiveTab("votes")}
                    >
                        Votes ({gem.votes?.length || 0})
                    </button>
                    <button
                        className={`gem-detail-tab ${activeTab === "stories" ? "active" : ""}`}
                        onClick={showStories}
                    >
                        Community Stories
                    </button>
                </div>

                <div className="gem-detail-content">

                    {activeTab === "details" && (
                        <div>

                            <div className="gem-detail-section">
                                <h3>Description</h3>
                                <p className="gem-detail-description-text">
                                    "{gem.description || "No description available."}"
                                </p>
                            </div>

                            <div className="gem-detail-section">
                                <h3>Location</h3>
                                <p className="gem-detail-address">
                                    {gem.address}
                                </p>
                                <p className="gem-detail-coords">
                                    {gem.latitude}, {gem.longitude}
                                </p>
                            </div>

                            {gem.status === "pending_community_vote" && (
                                <div className="gem-detail-section">
                                    <h3>Vote Progress</h3>
                                    <div className="gem-detail-progress-bar">
                                        <div
                                            className="gem-detail-progress-fill"
                                            style={{ width: `${Math.min((gem.vote_count / (gem.verification_threshold || 10)) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <p className="gem-detail-progress-text">
                                        {gem.vote_count || 0} of {gem.verification_threshold || 10} votes
                                        ({(gem.verification_threshold || 10) - (gem.vote_count || 0)} more needed)
                                    </p>
                                </div>
                            )}

                            {gem.status === "ai_rejected" && (
                                <div className="gem-detail-section">
                                    <h3>AI Verification Result</h3>
                                    <p className="gem-detail-description-text">
                                        {gem.ai_review_reason || "This submission did not meet HiddenMY's hidden gem requirements."}
                                    </p>
                                </div>
                            )}

                            <div className="gem-detail-section">
                                <h3>Discovered by</h3>
                                <p className="gem-detail-submitter">
                                    {gem.user?.name || "Unknown User"}
                                </p>
                            </div>

                            <div className="gem-detail-vote-section">
                                {gem.status === "pending_community_vote" ? (
                                    <button
                                        className="gem-detail-vote-btn"
                                        onClick={() => setShowVoteModal(true)}
                                    >
                                        Vote Now
                                    </button>
                                ) : gem.status === "hidden_gem" ? (
                                    <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                        Already a Hidden Gem
                                    </button>
                                ) : gem.status === "ai_rejected" ? null : (
                                    <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                        Being Verified by AI
                                    </button>
                                )}
                            </div>

                        </div>
                    )}

                    {activeTab === "votes" && (
                        <div className="gem-detail-votes-list">
                            {voteActionMessage && (
                                <p className="gem-detail-vote-action-error">
                                    {voteActionMessage}
                                </p>
                            )}

                            {gem.votes && gem.votes.length > 0 ? (
                                gem.votes.map((vote) => {
                                    const isOwnVote = Number(vote.user_id)
                                        === Number(currentUser?.id);

                                    return (
                                    <div
                                        id={`vote-${vote.id}`}
                                        key={vote.id}
                                        className={`gem-detail-vote-item ${
                                            isOwnVote ? "gem-detail-own-vote" : ""
                                        }`}
                                    >
                                        <div className="gem-detail-vote-avatar">
                                            {vote.user?.name?.charAt(0) || "U"}
                                        </div>
                                        <div className="gem-detail-vote-info">
                                            <p className="gem-detail-vote-user">{vote.user?.name || "Unknown User"}</p>
                                            {vote.photo_path && (
                                                <div className="gem-detail-vote-photo-section">
                                                    <img
                                                        src={getVotePhotoUrl(vote.photo_path)}
                                                        alt="Vote photo"
                                                        className="gem-detail-vote-photo"
                                                        onClick={() => setSelectedPhoto(vote.photo_path)}
                                                        style={{ cursor: 'pointer' }}
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                    {isOwnVote && (
                                                        <button
                                                            type="button"
                                                            className="gem-detail-vote-icon-btn"
                                                            title="Delete photo"
                                                            aria-label="Delete photo"
                                                            disabled={voteActionLoading}
                                                            onClick={() => {
                                                                setVoteActionMessage("");
                                                                setDeleteConfirmation({ type: "photo", vote });
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {editingVoteId === vote.id ? (
                                                <div className="gem-detail-vote-comment-edit">
                                                    <textarea
                                                        value={editComment}
                                                        onChange={(event) => setEditComment(event.target.value)}
                                                        maxLength={1000}
                                                    />
                                                    <div>
                                                        <button
                                                            type="button"
                                                            disabled={voteActionLoading || !editComment.trim()}
                                                            onClick={() => handleSaveComment(vote.id)}
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={voteActionLoading}
                                                            onClick={() => setEditingVoteId(null)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : vote.travel_description && (
                                                <div className="gem-detail-vote-comment-row">
                                                    <p className="gem-detail-vote-comment">
                                                        "{vote.travel_description}"
                                                    </p>
                                                    {isOwnVote && (
                                                        <div className="gem-detail-vote-owner-actions">
                                                            <button
                                                                type="button"
                                                                className="gem-detail-vote-icon-btn"
                                                                title="Edit comment"
                                                                aria-label="Edit comment"
                                                                disabled={voteActionLoading}
                                                                onClick={() => {
                                                                    setEditingVoteId(vote.id);
                                                                    setEditComment(vote.travel_description);
                                                                }}
                                                            >
                                                                ✎
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="gem-detail-vote-icon-btn"
                                                                title="Delete comment"
                                                                aria-label="Delete comment"
                                                                disabled={voteActionLoading}
                                                                onClick={() => {
                                                                    setVoteActionMessage("");
                                                                    setDeleteConfirmation({ type: "comment", vote });
                                                                }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <p className="gem-detail-vote-date">
                                                Voted on {new Date(vote.created_at).toLocaleDateString("en-GB", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric"
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    );
                                })
                            ) : (
                                <p className="gem-detail-no-votes">No votes yet. Be the first to vote!</p>
                            )}
                        </div>
                    )}

                    {activeTab === "stories" && (
                        <div className="gem-detail-stories-list">
                            {storiesLoading ? (
                                <p className="gem-detail-no-votes">Loading community stories…</p>
                            ) : storiesError ? (
                                <p className="gem-detail-no-votes">{storiesError}</p>
                            ) : storyPosts.length === 0 ? (
                                <p className="gem-detail-no-votes">
                                    No travel posts mention this gem yet. Be the first to write one!
                                </p>
                            ) : (
                                storyPosts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="gem-detail-story-card"
                                        onClick={() => navigate(`/travel-posts/${post.id}`)}
                                    >
                                        {(post.cover_image_url || post.images?.[0]?.image_url) ? (
                                            <img
                                                src={post.cover_image_url || post.images[0].image_url}
                                                alt={post.title}
                                                className="gem-detail-story-image"
                                            />
                                        ) : (
                                            <div className="gem-detail-story-image" />
                                        )}
                                        <div className="gem-detail-story-info">
                                            <p className="gem-detail-story-title">{post.title}</p>
                                            <p className="gem-detail-story-author">
                                                by {post.user?.name || "Traveler"}
                                            </p>
                                        </div>
                                        <span className="gem-detail-story-arrow">→</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                </div>

            </div>

            <VoteModal
                locationId={gem.id}
                isOpen={showVoteModal}
                onClose={() => setShowVoteModal(false)}
                onVoteSuccess={handleVoteSuccess}
            />

            {deleteConfirmation && (
                <div
                    className="delete-modal-overlay"
                    onClick={closeDeleteConfirmation}
                >
                    <div
                        className="delete-modal vote-delete-modal"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2>
                            {deleteConfirmation.type === "comment"
                                ? "Delete Comment?"
                                : "Delete Photo?"}
                        </h2>
                        <p>
                            {deleteConfirmation.type === "comment"
                                ? "Are you sure you want to delete your comment? Your vote will remain."
                                : "Are you sure you want to delete this photo? Your vote will remain."}
                        </p>

                        {voteActionMessage && (
                            <p className="vote-delete-modal-error">
                                {voteActionMessage}
                            </p>
                        )}

                        <div className="delete-modal-actions">
                            <button
                                type="button"
                                className="delete-modal-cancel"
                                onClick={closeDeleteConfirmation}
                                disabled={voteActionLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="delete-modal-confirm"
                                onClick={handleConfirmDelete}
                                disabled={voteActionLoading}
                            >
                                {voteActionLoading
                                    ? "Deleting..."
                                    : deleteConfirmation.type === "comment"
                                        ? "Delete Comment"
                                        : "Delete Photo"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedPhoto && (
                <div className="photo-modal-overlay" onClick={() => setSelectedPhoto(null)}>
                    <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="photo-modal-close" onClick={() => setSelectedPhoto(null)}>✕</button>
                        <img 
                            src={getVotePhotoUrl(selectedPhoto)}
                            alt="Vote photo enlarged"
                            className="photo-modal-image"
                        />
                    </div>
                </div>
            )}

        </div>
    );
}
