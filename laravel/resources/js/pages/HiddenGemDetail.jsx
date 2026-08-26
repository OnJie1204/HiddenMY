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
import ReportButton from "../components/ReportButton";
import SignInPrompt from "../components/SignInPrompt";
import { getReportForLocation, requestFixReview } from "../api/reports";
import FavouriteAchievementBadges from "../components/FavouriteAchievementBadges";
import { voteProgressLabel } from "../utils/gemStatus";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";
import { getTravelPostsForLocation } from "../api/travelPosts";
import { useCompare } from "../context/CompareContext";
import api from "../api";

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

const COMMENT_EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;

const REPORT_REASON_LABELS = {
    permanently_closed: "Permanently closed",
    incorrect_location: "Incorrect location",
    not_actually_hidden: "No longer hidden (gone viral / well known)",
    duplicate: "Duplicate of another gem",
    inappropriate_content: "Inappropriate content",
};

function canEditWithinCommentWindow(createdAt) {
    const createdAtMs = new Date(createdAt).getTime();

    return Number.isFinite(createdAtMs)
        && Date.now() <= createdAtMs + COMMENT_EDIT_WINDOW_MS;
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
        return ["votes", "stories", "comments"].includes(openTab) ? openTab : "details";
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
    const [reportInfo, setReportInfo] = useState(null);
    const [fixReviewLoading, setFixReviewLoading] = useState(false);
    const [fixReviewMessage, setFixReviewMessage] = useState("");
    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");
    const { isComparing, toggleCompare, canAddMore, maxCompare } = useCompare();

    const requireSignIn = (message) => {
        setSignInMessage(message);
        setShowSignIn(true);
    };

    const [interactions, setInteractions] = useState({
        comments: [],
        user_comment: null,
    });

    const [newComment, setNewComment] = useState("");
    const [newRating, setNewRating] = useState(5);
    const [submittingComment, setSubmittingComment] = useState(false);

    // ==================== Comment Edit/Delete State ====================
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editCommentText, setEditCommentText] = useState("");
    const [editRating, setEditRating] = useState(5);
    const [commentActionMessage, setCommentActionMessage] = useState("");
    const [commentActionLoading, setCommentActionLoading] = useState(false);
    const [deleteCommentId, setDeleteCommentId] = useState(null);

    // ==================== Comment Filter ====================
    const [ratingFilter, setRatingFilter] = useState(0); // 0 = all
    const [filterType, setFilterType] = useState('all'); // 'all', 'rating', 'with_comment'

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

    const fetchInteractions = async () => {
        try {
            const response = await api.get(`/gem-interactions/${id}`);
            setInteractions(response.data);
        } catch (err) {
            console.error("Error fetching interactions:", err);
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            requireSignIn("Sign in to rate or comment on this hidden gem.");
            return;
        }

        // Require rating (always needed)
        if (!newRating) return;

        // Comment is optional - can submit with just rating
        // If comment is provided, it must have content
        if (newComment.trim() && newComment.trim().length === 0) return;

        setSubmittingComment(true);
        try {
            await api.post(`/gem-interactions/${id}`, {
                type: 'comment',
                comment: newComment.trim() || null,  // null if empty
                rating: newRating
            });
            setNewComment("");
            setNewRating(5);
            fetchInteractions();
        } catch (err) {
            console.error("Error submitting comment:", err);
            if (err.response?.status === 401) {
                alert("Please login first");
            }
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleEditComment = (comment) => {
        setEditingCommentId(comment.id);
        setEditCommentText(comment.comment || "");  // Handle null
        setEditRating(comment.rating || 5);
        setCommentActionMessage("");
    };

    const handleCancelEdit = () => {
        setEditingCommentId(null);
        setEditCommentText("");
        setEditRating(5);
        setCommentActionMessage("");
    };

    const handleSaveCommentEdit = async (commentId) => {
        // Only require rating, comment can be empty
        if (!editRating) return;

        setCommentActionLoading(true);
        setCommentActionMessage("");

        try {
            await api.put(`/gem-interactions/comments/${commentId}`, {
                comment: editCommentText.trim() || null,  // null if empty
                rating: editRating
            });
            setEditingCommentId(null);
            setEditCommentText("");
            setEditRating(5);
            fetchInteractions();
            setCommentActionMessage("Comment updated successfully!");
            setTimeout(() => setCommentActionMessage(""), 3000);
        } catch (err) {
            setCommentActionMessage(
                err.response?.data?.message || "Failed to update comment."
            );
            console.error("Error updating comment:", err);
        } finally {
            setCommentActionLoading(false);
        }
    };

    const handleDeleteGemComment = async (commentId) => {
        setCommentActionLoading(true);
        setCommentActionMessage("");

        try {
            await api.delete(`/gem-interactions/comments/${commentId}`);
            setDeleteCommentId(null);
            fetchInteractions();
            setCommentActionMessage("Comment deleted successfully!");
            setTimeout(() => setCommentActionMessage(""), 3000);
        } catch (err) {
            setCommentActionMessage(
                err.response?.data?.message || "Failed to delete comment."
            );
            console.error("Error deleting comment:", err);
        } finally {
            setCommentActionLoading(false);
        }
    };

    useEffect(() => {
        fetchDetail();
        fetchInteractions();
    }, [id]);

    useEffect(() => {
        getMe()
            .then((response) => setCurrentUser(response.data))
            .catch(() => setCurrentUser(null));
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(g => g.id))))
            .catch(err => console.error("Error fetching wishlist:", err));
    }, [currentUser]);

    useEffect(() => {
        if (!gem || gem.status !== "delisted" || !currentUser || Number(gem.user_id) !== Number(currentUser.id)) {
            setReportInfo(null);
            return;
        }
        getReportForLocation(gem.id)
            .then((res) => setReportInfo(res.data))
            .catch(() => setReportInfo(null));
    }, [gem, currentUser]);

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

    useEffect(() => {
        if (
            activeTab === "comments"
            && interactions.comments.length > 0
            && routeLocation.state?.interactionId
        ) {
            const interactionElement = document.getElementById(
                `interaction-${routeLocation.state.interactionId}`
            );

            interactionElement?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [activeTab, interactions.comments, routeLocation.state]);

    const handleToggleWishlist = async () => {
        if (!gem || wishlistBusy) return;
        if (!currentUser) {
            requireSignIn("Sign in to save gems to your wishlist.");
            return;
        }

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

    const handleRequestFixReview = async () => {
        if (!reportInfo?.root_report) return;
        setFixReviewLoading(true);
        setFixReviewMessage("");
        try {
            await requestFixReview(reportInfo.root_report.id);
            const res = await getReportForLocation(gem.id);
            setReportInfo(res.data);
            setFixReviewMessage("Fix submitted — the community will now vote on whether it resolves the report.");
        } catch (err) {
            setFixReviewMessage(err.response?.data?.message || "Could not request a fix review.");
        } finally {
            setFixReviewLoading(false);
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

    // ==================== Star Rating Component ====================
    const StarRating = ({ value, onChange, size = "small" }) => {
        const [hoverRating, setHoverRating] = useState(0);

        return (
            <div className={`star-rating ${size}`}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <span
                        key={star}
                        className={`star ${star <= (hoverRating || value) ? "filled" : ""}`}
                        onClick={() => onChange && onChange(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                    >
                        ★
                    </span>
                ))}
            </div>
        );
    };

    // ==================== Count Ratings ====================
    const ratingCounts = {
        5: interactions.comments?.filter(c => c.rating === 5).length || 0,
        4: interactions.comments?.filter(c => c.rating === 4).length || 0,
        3: interactions.comments?.filter(c => c.rating === 3).length || 0,
        2: interactions.comments?.filter(c => c.rating === 2).length || 0,
        1: interactions.comments?.filter(c => c.rating === 1).length || 0,
    };

    const totalRatings = interactions.comments?.length || 0;

    const averageRating = totalRatings > 0
        ? (interactions.comments.reduce((sum, c) => sum + (c.rating || 0), 0) / totalRatings).toFixed(1)
        : 0;

    // ==================== Filtered Comments ====================
    const filteredComments = interactions.comments?.filter(comment => {
        // Filter by rating
        if (ratingFilter > 0 && comment.rating !== ratingFilter) return false;

        // Filter by type
        if (filterType === 'with_comment' && !comment.comment) return false;
        if (filterType === 'rating_only' && comment.comment) return false;

        return true;
    }) || [];

    // ==================== Has User Commented ====================
    const hasUserCommented = interactions.comments?.some(
        comment => Number(comment.user_id) === Number(currentUser?.id)
    );

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
                    if (routeLocation.state?.fromMyRatings) {
                        navigate("/my-hidden-gems", {
                            state: {
                                activeTab: "contributions",
                                contributionTab: "ratings",
                            },
                        });
                        return;
                    }

                    if (routeLocation.state?.fromMyVotes) {
                        navigate("/my-hidden-gems", {
                            state: {
                                activeTab: "contributions",
                                contributionTab: "votes",
                            },
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
                                    onClick={() => {
                                        if (!currentUser) {
                                            requireSignIn("Sign in to compare hidden gems.");
                                            return;
                                        }
                                        toggleCompare(gem);
                                    }}
                                    disabled={!isComparing(gem.id) && !canAddMore}
                                    title={isComparing(gem.id)
                                        ? "Remove from comparison"
                                        : (canAddMore ? "Add to comparison" : `You can compare up to ${maxCompare} at a time`)}
                                >
                                    {isComparing(gem.id) ? "☑" : "☐"}
                                </button>
                                <ReportButton gem={gem} user={currentUser} />
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
                            {gem.status === "pending_community_vote" && (
                                <span className="gem-detail-status-pending">
                                    {gem.vote_count || 0} of {gem.verification_threshold || 10} votes
                                </span>
                            )}
                        </div>
                        <div className="gem-detail-status-row">
                            {gem.status === "hidden_gem" ? (
                                <span className="gem-detail-status-verified">Hidden Gem</span>
                            ) : gem.status === "ai_rejected" ? (
                                <span className="gem-detail-status-rejected" title={gem.ai_review_reason || ""}>
                                    Not Accepted
                                </span>
                            ) : gem.status === "delisted" ? (
                                <span className="gem-detail-status-rejected">
                                    Delisted
                                </span>
                            ) : null}
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
                    <button
                        className={`gem-detail-tab ${activeTab === "comments" ? "active" : ""}`}
                        onClick={() => setActiveTab("comments")}
                    >
                        Ratings ({totalRatings})
                    </button>
                </div>

                <div className="gem-detail-content">

                {activeTab === "details" && (
                    <div className="gem-detail-sections">
                        {/* Location Card */}
                        <div className="gem-detail-section-card">
                            <div className="gem-detail-section-header">
                                <span className="gem-detail-section-icon">📍</span>
                                <h3>Location</h3>
                            </div>
                            <Link
                                to={`/map?lat=${gem.latitude}&lng=${gem.longitude}`}
                                state={{ highlightGem: gem, openPanel: true, flyTo: true }}
                                className="gem-detail-location-link"
                            >
                                {gem.address}
                            </Link>
                            <p className="gem-detail-coords"></p>
                        </div>

                        {/* Description Card */}
                        <div className="gem-detail-section-card">
                            <div className="gem-detail-section-header">
                                <span className="gem-detail-section-icon">📝</span>
                                <h3>Description</h3>
                            </div>
                            <p className="gem-detail-description-text">
                                "{gem.description || "No description available."}"
                            </p>
                        </div>

                        {/* Vote Progress Card */}
                        {gem.status === "pending_community_vote" && (
                            <div className="gem-detail-section-card">
                                <div className="gem-detail-section-header">
                                    <span className="gem-detail-section-icon">🗳️</span>
                                    <h3>Vote Progress</h3>
                                </div>
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

                        {/* AI Rejected Card */}
                        {gem.status === "ai_rejected" && (
                            <div className="gem-detail-section-card">
                                <div className="gem-detail-section-header">
                                    <span className="gem-detail-section-icon">🤖</span>
                                    <h3>AI Verification Result</h3>
                                </div>
                                <p className="gem-detail-description-text">
                                    {gem.ai_review_reason || "This submission did not meet HiddenMY's hidden gem requirements."}
                                </p>
                            </div>
                        )}

                        {/* Discovered by Card */}
                        <div className="gem-detail-section-card">
                            <div className="gem-detail-section-header">
                                <span className="gem-detail-section-icon">👤</span>
                                <h3>Discovered by</h3>
                            </div>
                            <div className="gem-detail-submitter-identity">
                                <Link to={`/users/${gem.user?.id || ''}`} className="gem-detail-submitter-link">
                                    {gem.user?.name || "Unknown User"}
                                </Link>
                                <FavouriteAchievementBadges
                                    favourites={gem.user?.favourite_achievements}
                                    className="gem-detail-submitter-achievements"
                                />
                            </div>
                        </div>

                        {/* Vote Button */}
                        <div className="gem-detail-vote-section">
                            {gem.status === "pending_community_vote" ? (
                                <button
                                    className="gem-detail-vote-btn"
                                    onClick={() => {
                                        if (!currentUser) {
                                            requireSignIn("Sign in to vote on this hidden gem.");
                                            return;
                                        }
                                        setShowVoteModal(true);
                                    }}
                                >
                                    🗳️ Vote Now
                                </button>
                            ) : gem.status === "hidden_gem" ? (
                                <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                    ✓ Already a Hidden Gem
                                </button>
                            ) : gem.status === "ai_rejected" ? null : gem.status === "delisted" ? (
                                <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                    ⚠ Delisted after a confirmed report
                                </button>
                            ) : (
                                <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                    ⏳ Being Verified
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {gem.status === "delisted" && reportInfo?.root_report && Number(gem.user_id) === Number(currentUser?.id) && (
                    <div className="report-owner-banner">
                        <h3>⚠ This gem was delisted</h3>
                        <p>
                            The community confirmed a report: <strong>{REPORT_REASON_LABELS[reportInfo.root_report.reason] || reportInfo.root_report.reason}</strong>
                            {reportInfo.root_report.flagged_item && (
                                <> — flagged: {reportInfo.root_report.flagged_item === "description" ? "the description" : "a photo"}</>
                            )}
                            .
                        </p>
                        {reportInfo.data.id === reportInfo.root_report.id ? (
                            <>
                                {reportInfo.root_report.delete_at && (
                                    <p className="report-owner-countdown">
                                        Fix this by{" "}
                                        <strong>
                                            {new Date(reportInfo.root_report.delete_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                                        </strong>{" "}
                                        or it will be permanently removed.
                                    </p>
                                )}
                                <div className="report-owner-actions">
                                    <Link to={`/my-hidden-gems/edit/${gem.id}`} className="vote-btn-secondary">Edit Gem</Link>
                                    <button className="vote-btn-primary" onClick={handleRequestFixReview} disabled={fixReviewLoading}>
                                        {fixReviewLoading ? "Submitting..." : "I've fixed it — request review"}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="report-owner-countdown">
                                A fix is already under review: {reportInfo.data.confirm_count} confirm / {reportInfo.data.dispute_count} dispute.
                            </p>
                        )}
                        {fixReviewMessage && <p className="vote-message success">{fixReviewMessage}</p>}
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
                                    const canEditVoteComment = canEditWithinCommentWindow(vote.created_at);

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
                                                            {canEditVoteComment && (
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
                                                            )}
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

                    {activeTab === "comments" && (
                        <div className="gem-detail-comments">
                            {commentActionMessage && (
                                <div className={`gem-detail-comment-action-message ${
                                    commentActionMessage.includes('success') ? 'success' : 'error'
                                }`}>
                                    {commentActionMessage}
                                </div>
                            )}

                            {/* Rating Summary Box */}
                            {totalRatings > 0 && (
                                <div className="gem-rating-summary">
                                    <div className="gem-rating-left">
                                        <div className="gem-rating-score">
                                            {averageRating}
                                        </div>
                                        <div className="gem-rating-outof">
                                            out of 5
                                        </div>
                                        <div className="gem-rating-stars">
                                            <StarRating value={Math.round(averageRating)} size="medium" />
                                        </div>
                                    </div>
                                    <div className="gem-rating-right">
                                        <div className="gem-rating-filter-buttons">
                                            <button
                                                className={`gem-filter-btn ${ratingFilter === 0 ? 'active' : ''}`}
                                                onClick={() => { setRatingFilter(0); setFilterType('all'); }}
                                            >
                                                All
                                            </button>
                                            {[5, 4, 3, 2, 1].map((rating) => (
                                                <button
                                                    key={rating}
                                                    className={`gem-filter-btn ${ratingFilter === rating ? 'active' : ''}`}
                                                    onClick={() => { setRatingFilter(rating); setFilterType('all'); }}
                                                >
                                                    {rating} Star ({ratingCounts[rating]})
                                                </button>
                                            ))}
                                        </div>
                                        <div className="gem-rating-filter-buttons gem-rating-filter-row2">
                                            <button
                                                className={`gem-filter-btn ${filterType === 'with_comment' ? 'active' : ''}`}
                                                onClick={() => { setFilterType('with_comment'); setRatingFilter(0); }}
                                            >
                                                With Comments ({interactions.comments?.filter(c => c.comment).length || 0})
                                            </button>
                                            <button
                                                className={`gem-filter-btn ${filterType === 'rating_only' ? 'active' : ''}`}
                                                onClick={() => { setFilterType('rating_only'); setRatingFilter(0); }}
                                            >
                                                Rating Only ({interactions.comments?.filter(c => !c.comment).length || 0})
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Rating + Comment Form */}
                            {hasUserCommented ? (
                                <div className="gem-detail-already-commented">
                                    <p>You have already rated this location.</p>
                                    <p>You can edit your comment below.</p>
                                </div>
                            ) : (
                                <form className="gem-detail-comment-form" onSubmit={handleCommentSubmit}>
                                    <div className="gem-detail-comment-rating-input">
                                        <label>Your Rating:</label>
                                        <StarRating value={newRating} onChange={setNewRating} size="medium" />
                                    </div>
                                    <input
                                        type="text"
                                        className="gem-detail-comment-input"
                                        placeholder="Write a comment (optional)..."
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        className="gem-detail-comment-submit"
                                        disabled={submittingComment || !newRating}
                                    >
                                        Post
                                    </button>
                                </form>
                            )}

                            {/* Comments List */}
                            <div className="gem-detail-comments-list">
                                {filteredComments.length > 0 ? (
                                    filteredComments.map((comment) => {
                                        const isOwnComment = Number(comment.user_id) === Number(currentUser?.id);
                                        const isEditing = editingCommentId === comment.id;
                                        const createdAt = new Date(comment.created_at);
                                        const canEdit = canEditWithinCommentWindow(comment.created_at);

                                        return (
                                            <div
                                                id={`interaction-${comment.id}`}
                                                key={comment.id}
                                                className="gem-detail-comment-item"
                                            >
                                                <div className="gem-detail-comment-avatar">
                                                    {comment.user?.name?.charAt(0) || "U"}
                                                </div>
                                                <div className="gem-detail-comment-info">
                                                    <div className="gem-detail-comment-user-row">
                                                        <p className="gem-detail-comment-user">
                                                            {comment.user?.name || "Unknown User"}
                                                            {isOwnComment && (
                                                                <span className="gem-detail-comment-badge">You</span>
                                                            )}
                                                            {!canEdit && isOwnComment && (
                                                                <span className="gem-detail-comment-badge gem-detail-comment-badge-locked">
                                                                    🔒 Edit locked
                                                                </span>
                                                            )}
                                                        </p>
                                                        {comment.rating && (
                                                            <div className="gem-detail-comment-stars">
                                                                <StarRating value={comment.rating} size="tiny" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {isEditing ? (
                                                        <div className="gem-detail-comment-edit-area">
                                                            <div className="gem-detail-comment-rating-input">
                                                                <label>Your Rating:</label>
                                                                <StarRating value={editRating} onChange={setEditRating} size="medium" />
                                                            </div>
                                                            <textarea
                                                                className="gem-detail-comment-edit-input"
                                                                value={editCommentText}
                                                                onChange={(e) => setEditCommentText(e.target.value)}
                                                                maxLength={500}
                                                                disabled={commentActionLoading}
                                                                placeholder="Write a comment (optional)..."
                                                            />
                                                            <div className="gem-detail-comment-edit-actions">
                                                                <button
                                                                    type="button"
                                                                    className="gem-detail-comment-edit-save"
                                                                    onClick={() => handleSaveCommentEdit(comment.id)}
                                                                    disabled={commentActionLoading || !editRating}
                                                                >
                                                                    {commentActionLoading ? "Saving..." : "Save"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="gem-detail-comment-edit-cancel"
                                                                    onClick={handleCancelEdit}
                                                                    disabled={commentActionLoading}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="gem-detail-comment-text-wrapper">
                                                            {comment.comment ? (
                                                                <p className="gem-detail-comment-text">
                                                                    "{comment.comment}"
                                                                </p>
                                                            ) : (
                                                                <p className="gem-detail-comment-text gem-detail-no-comment-text">
                                                                    No comment
                                                                </p>
                                                            )}
                                                            {isOwnComment && !isEditing && (
                                                                <span className="gem-detail-comment-actions">
                                                                    {canEdit && (
                                                                        <button
                                                                            type="button"
                                                                            className="gem-detail-comment-edit-btn"
                                                                            onClick={() => handleEditComment(comment)}
                                                                            disabled={commentActionLoading}
                                                                        >
                                                                            ✎
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        className="gem-detail-comment-delete-btn"
                                                                        onClick={() => setDeleteCommentId(comment.id)}
                                                                        disabled={commentActionLoading}
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    <p className="gem-detail-comment-date">
                                                        Voted on {createdAt.toLocaleDateString("en-GB", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric"
                                                        })}
                                                        {isOwnComment && !isEditing && !canEdit && (
                                                            <span className="gem-detail-comment-edit-locked">
                                                                (Cannot edit after 3 days)
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="gem-detail-no-comments">
                                        {totalRatings > 0
                                            ? "No results match your filter."
                                            : "No ratings yet. Be the first to rate!"}
                                    </p>
                                )}
                            </div>

                            {deleteCommentId && (
                                <div className="delete-modal-overlay" onClick={() => setDeleteCommentId(null)}>
                                    <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
                                        <h2>Delete Comment?</h2>
                                        <p>Are you sure you want to delete this comment? This action cannot be undone.</p>
                                        {commentActionMessage && (
                                            <p className="delete-modal-error">{commentActionMessage}</p>
                                        )}
                                        <div className="delete-modal-actions">
                                            <button
                                                type="button"
                                                className="delete-modal-cancel"
                                                onClick={() => setDeleteCommentId(null)}
                                                disabled={commentActionLoading}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="delete-modal-confirm"
                                                onClick={() => handleDeleteGemComment(deleteCommentId)}
                                                disabled={commentActionLoading}
                                            >
                                                {commentActionLoading ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
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

            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={signInMessage}
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
