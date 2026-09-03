import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { getHiddenGemDetail, updateHiddenGem } from "../api/hiddenGems";
import { getMe } from "../api/auth";
import VoteModal from "../components/VoteModal";
import ReportButton from "../components/ReportButton";
import VerifyReportModal from "../components/VerifyReportModal";
import Spinner from "../components/Spinner";
import SignInPrompt from "../components/SignInPrompt";
import { getReportForLocation } from "../api/reports";
import FavouriteAchievementBadges from "../components/FavouriteAchievementBadges";
import PhotoCarousel from "../components/PhotoCarousel";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";
import { getTripItineraries, addTripLocation, createTripItinerary } from "../api/TripItinerary";

// Backend caps trip_name at 10 characters (TripItineraryController::store).
const ITINERARY_NAME_MAX = 10;
import { getTravelPostsForLocation } from "../api/travelPosts";
import MenuItems from "../components/MenuItems";
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

function canEditWithinCommentWindow(createdAt) {
    const createdAtMs = new Date(createdAt).getTime();

    return Number.isFinite(createdAtMs)
        && Date.now() <= createdAtMs + COMMENT_EDIT_WINDOW_MS;
}

export default function HiddenGemDetail({ user }) {
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
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistBusy, setWishlistBusy] = useState(false);
    const [wishlistError, setWishlistError] = useState("");
    const [storyPosts, setStoryPosts] = useState([]);
    const [storiesLoading, setStoriesLoading] = useState(false);
    const [storiesLoaded, setStoriesLoaded] = useState(false);
    const [storiesError, setStoriesError] = useState("");
    const [contactEdit, setContactEdit] = useState(null);
    const [contactEditSaving, setContactEditSaving] = useState(false);
    const [contactEditMessage, setContactEditMessage] = useState("");
    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");
    const [itineraries, setItineraries] = useState([]);
    const [isLoadingItineraries, setIsLoadingItineraries] = useState(false);
    const [itineraryOpen, setItineraryOpen] = useState(false);
    const [itineraryStatus, setItineraryStatus] = useState(null);
    const [showItineraryForm, setShowItineraryForm] = useState(false);
    const [newItineraryName, setNewItineraryName] = useState("");
    const [creatingItinerary, setCreatingItinerary] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [activeReport, setActiveReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);

    const galleryImages = gem?.images ?? [];

    // A permanently-closed gem is frozen: no new votes, ratings,
    // comments, menu items, itinerary adds or reports (see
    // Location::acceptsNewInteractions on the backend). Existing content stays
    // readable; the owner can still resubmit or delete it.
    const isClosed = !!(gem && gem.permanently_closed_at);

    // Same rule the backend enforces (TripItineraryController::publiclyVisible()).
    const canAddToItinerary = gem
        && !isClosed
        && (gem.status === "hidden_gem" || gem.status === "pending_community_vote");

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

    // Comment Photo States
    const [commentPhoto, setCommentPhoto] = useState(null);
    const [commentPhotoPreview, setCommentPhotoPreview] = useState(null);
    const [editCommentPhoto, setEditCommentPhoto] = useState(null);
    const [editCommentPhotoPreview, setEditCommentPhotoPreview] = useState(null);
    const [removeExistingCommentPhoto, setRemoveExistingCommentPhoto] = useState(false);

    // ==================== Comment Edit State ====================
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editCommentText, setEditCommentText] = useState("");
    const [editRating, setEditRating] = useState(5);
    const [commentActionMessage, setCommentActionMessage] = useState("");
    const [commentActionLoading, setCommentActionLoading] = useState(false);

    // ==================== Comment Filter ====================
    const [ratingFilter, setRatingFilter] = useState(0);
    const [filterType, setFilterType] = useState('all');

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

    const handleCommentPhotoChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setCommentPhoto(file);
            setCommentPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleEditCommentPhotoChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditCommentPhoto(file);
            setEditCommentPhotoPreview(URL.createObjectURL(file));
            setRemoveExistingCommentPhoto(false);
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            requireSignIn("Login to rate or comment on this hidden gem.");
            return;
        }

        if (gem && Number(gem.user_id) === Number(currentUser.id)) {
            setCommentActionMessage("You cannot rate or comment on your own Hidden Gem.");
            return;
        }

        if (!newRating) return;

        setSubmittingComment(true);
        try {
            const formData = new FormData();
            formData.append('type', 'comment');
            formData.append('comment', newComment.trim() || '');
            formData.append('rating', newRating);
            if (commentPhoto) {
                formData.append('photo', commentPhoto);
            }

            await api.post(`/gem-interactions/${id}`, formData);
            setNewComment("");
            setNewRating(5);
            setCommentPhoto(null);
            setCommentPhotoPreview(null);
            await fetchInteractions();
        } catch (err) {
                console.error("Error submitting comment:", err);
                console.error("STATUS:", err.response?.status);
                console.error("DATA:", err.response?.data);

                setCommentActionMessage(
                    err.response?.data?.message ||
                    JSON.stringify(err.response?.data?.errors) ||
                    "Failed to post rating."
                );
            } finally {
            setSubmittingComment(false);
        }
    };

    const handleEditComment = (comment) => {
        setEditingCommentId(comment.id);
        setEditCommentText(comment.comment || "");
        setEditRating(comment.rating || 5);
        setEditCommentPhoto(null);
        setEditCommentPhotoPreview(null);
        setRemoveExistingCommentPhoto(false);
        setCommentActionMessage("");
    };

    const handleCancelEdit = () => {
        setEditingCommentId(null);
        setEditCommentText("");
        setEditRating(5);
        setEditCommentPhoto(null);
        setEditCommentPhotoPreview(null);
        setRemoveExistingCommentPhoto(false);
        setCommentActionMessage("");
    };

    const handleSaveCommentEdit = async (commentId) => {
        if (!editRating) return;

        setCommentActionLoading(true);
        setCommentActionMessage("");

        try {
            const formData = new FormData();
            formData.append('_method', 'PUT');
            formData.append('comment', editCommentText.trim() || '');
            formData.append('rating', String(editRating));

            if (editCommentPhoto) {
                formData.append('photo', editCommentPhoto);
            }

            if (removeExistingCommentPhoto) {
                formData.append('remove_photo', '1');
            }

            await api.post(`/gem-interactions/comments/${commentId}`, formData);

            setEditingCommentId(null);
            setEditCommentText("");
            setEditRating(5);
            setEditCommentPhoto(null);
            setEditCommentPhotoPreview(null);
            setRemoveExistingCommentPhoto(false);

            await fetchInteractions();

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

    // Seed the inline contact-edit form once the community has unlocked it
    // for the owner (edit_mode === 'contact_only').
    useEffect(() => {
        const isOwner = gem && currentUser && Number(gem.user_id) === Number(currentUser.id);
        if (!isOwner || gem.edit_mode !== "contact_only") {
            setContactEdit(null);
            return;
        }
        const ctx = gem.contact_edit_context || {};
        setContactEdit({
            opening_hours: ctx.suggested_opening_hours ?? gem.opening_hours ?? "",
            phone: ctx.suggested_phone ?? gem.phone ?? "",
            website: ctx.suggested_website ?? gem.website ?? "",
        });
        setContactEditMessage("");
    }, [gem, currentUser]);

    useEffect(() => {
        if (!currentUser) {
            setItineraries([]);
            return;
        }
        setIsLoadingItineraries(true);
        getTripItineraries()
            .then((res) => setItineraries(res.data || []))
            .catch(() => setItineraries([]))
            .finally(() => setIsLoadingItineraries(false));
    }, [currentUser]);

    useEffect(() => {
        setItineraryOpen(false);
        setItineraryStatus(null);
        setShowItineraryForm(false);
        setNewItineraryName("");
    }, [id]);

    async function handleAddToItinerary(trip) {
        setItineraryStatus({ type: "loading", message: `Adding to "${trip.trip_name}"…` });
        try {
            await addTripLocation(trip.id, { source: "database", location_id: gem.id });
            setItineraryStatus({ type: "success", message: `Added to "${trip.trip_name}".` });
            setItineraryOpen(false);
            setShowItineraryForm(false);
            setNewItineraryName("");
        } catch (error) {
            setItineraryStatus({
                type: "error",
                message: error?.response?.data?.message || "Could not add this gem to the trip.",
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
            setItineraries((prev) => [newTrip, ...prev]);
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
            requireSignIn("Login to save gems to your wishlist.");
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

    const handleSaveContactEdit = async () => {
        if (!contactEdit) return;
        setContactEditSaving(true);
        setContactEditMessage("");
        try {
            await updateHiddenGem(gem.id, {
                opening_hours: contactEdit.opening_hours || "",
                phone: contactEdit.phone || "",
                website: contactEdit.website || "",
            });
            await fetchDetail();
            setContactEditMessage("Contact information updated.");
        } catch (err) {
            setContactEditMessage(err.response?.data?.message || "Could not update the contact info.");
        } finally {
            setContactEditSaving(false);
        }
    };

    // Dedicated "Help Verify" entry point on the detail page — separate from
    // the small report-icon toggle, which visitors could easily miss or
    // mistake for "report a new problem" instead of "verify the existing one".
    async function handleHelpVerify() {
        if (!currentUser) {
            requireSignIn("Login to help verify this report.");
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

    const fetchStories = async () => {
        setStoriesLoading(true);
        setStoriesError("");

        try {
            const response = await getTravelPostsForLocation(id);
            setStoryPosts(response.data.data || []);
            setStoriesLoaded(true);
        } catch (err) {
            console.error("Error fetching travel posts for gem:", err);
            setStoryPosts([]);
            setStoriesError(err.response?.data?.message || "Failed to load community stories.");
        } finally {
            setStoriesLoading(false);
        }
    };

    const showStories = () => {
        setActiveTab("stories");

        if (!storiesLoaded && !storiesLoading) {
            fetchStories();
        }
    };

    useEffect(() => {
        setStoryPosts([]);
        setStoriesLoaded(false);
        fetchStories();
    }, [id]);

    useEffect(() => {
        if (routeLocation.state?.openTab === "stories") {
            setActiveTab("stories");
        }
    }, [routeLocation.state]);

    const handleVoteSuccess = (data) => {
        setVoteSuccess(true);
        setVoteMessage(data.message || "Vote submitted successfully.");
        fetchDetail();

        setTimeout(() => {
            setVoteSuccess(false);
            setVoteMessage("");
        }, 3000);
    };

    // ==================== Star Rating Component ====================
    const StarRating = ({ value, onChange, size = "small" }) => {
        const [hoverRating, setHoverRating] = useState(0);
        const isInteractive = typeof onChange === "function";
        const displayedRating = isInteractive && hoverRating ? hoverRating : value;

        return (
            <div className={`star-rating ${size} ${isInteractive ? "interactive" : "readonly"}`}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <span
                        key={star}
                        className={`star ${star <= displayedRating ? "filled" : ""}`}
                        onClick={isInteractive ? () => onChange(star) : undefined}
                        onMouseEnter={isInteractive ? () => setHoverRating(star) : undefined}
                        onMouseLeave={isInteractive ? () => setHoverRating(0) : undefined}
                        style={{ pointerEvents: isInteractive ? "auto" : "none" }}
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
        if (ratingFilter > 0 && comment.rating !== ratingFilter) return false;
        if (filterType === 'with_comment' && !comment.comment) return false;
        if (filterType === 'rating_only' && comment.comment) return false;
        if (filterType === 'with_photo' && !comment.photo_path) return false;
        return true;
    }) || [];

    // ==================== Has User Commented ====================
    const hasUserCommented = interactions.comments?.some(
        comment => Number(comment.user_id) === Number(currentUser?.id)
    );

    const isGemOwner = Boolean(
        currentUser &&
        gem &&
        Number(gem.user_id) === Number(currentUser.id)
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
        <div className={`gem-detail-page${gem.permanently_closed_at ? " gem-detail-page-closed" : ""}`}>


            <div className="gem-detail-container">

                <div className="gem-detail-gallery">
                    {galleryImages.length > 0 ? (
                        <PhotoCarousel
                            images={galleryImages}
                            alt={gem.place_name}
                            className="gem-detail-carousel"
                            onImageClick={(url) => setSelectedPhoto(url)}
                        />
                    ) : (
                        <div className="gem-detail-main-image">
                            <div className="gem-detail-main-placeholder">No Image</div>
                        </div>
                    )}
                </div>

                <div className="gem-detail-header">
                    <div className="gem-detail-title-row">
                        <h1 className="gem-detail-title">{gem.place_name}</h1>
                        {!isClosed && (gem.status === "hidden_gem" || gem.status === "pending_community_vote" || (gem.status === "delisted" && gem.report_status === "upheld")) && (
                            <div className="hidden-gems-card-icon-actions">
                                {(gem.status === "hidden_gem" || gem.status === "pending_community_vote") && (
                                        <button
                                            type="button"
                                            className={`gem-detail-wishlist-btn ${wishlistIds.has(gem.id) ? "active" : ""}`}
                                            onClick={handleToggleWishlist}
                                            disabled={wishlistBusy}
                                            title={wishlistIds.has(gem.id) ? "Remove from wishlist" : "Save to wishlist"}
                                        >
                                            {wishlistIds.has(gem.id) ? "♥" : "♡"}
                                        </button>
                                )}
                                <div className="gem-detail-report-btn-wrapper">
                                    <ReportButton gem={gem} user={currentUser} />
                                </div>
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
                                    {gem.votes?.length || 0} of {gem.verification_threshold || 10} votes
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
                            {gem.permanently_closed_at && (
                                <span className="gem-detail-status-rejected" title="The community confirmed this place has closed for good">
                                    Permanently closed
                                </span>
                            )}
                        </div>

                        {canAddToItinerary && (
                            <div className="gem-detail-itinerary">
                                <button
                                    type="button"
                                    className="gem-detail-itinerary-btn"
                                    onClick={() => {
                                        if (!currentUser) {
                                            requireSignIn("Login to add this gem to a trip itinerary.");
                                            return;
                                        }
                                        setItineraryStatus(null);
                                        setShowItineraryForm(false);
                                        setNewItineraryName("");
                                        setItineraryOpen((open) => !open);
                                    }}
                                >
                                    ＋ Add to itinerary
                                </button>

                                {itineraryOpen && currentUser && (
                                    <div className="gem-detail-itinerary-picker">
                                        {isLoadingItineraries && (
                                            <Spinner size="sm" inline label="Loading itineraries…" />
                                        )}

                                        {!isLoadingItineraries && itineraries.length > 0 && (
                                            <>
                                                <h4>Add to which trip?</h4>
                                                {itineraries.map((trip) => (
                                                    <button
                                                        key={trip.id}
                                                        type="button"
                                                        className="gem-detail-itinerary-option"
                                                        onClick={() => handleAddToItinerary(trip)}
                                                    >
                                                        {trip.trip_name}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {!isLoadingItineraries && (showItineraryForm ? (
                                            <form
                                                className="gem-detail-itinerary-create"
                                                onSubmit={(event) => {
                                                    event.preventDefault();
                                                    handleCreateItineraryAndAdd();
                                                }}
                                            >
                                                <input
                                                    type="text"
                                                    className="gem-detail-itinerary-create-input"
                                                    placeholder="New trip name"
                                                    maxLength={ITINERARY_NAME_MAX}
                                                    value={newItineraryName}
                                                    onChange={(event) => setNewItineraryName(event.target.value)}
                                                    autoFocus
                                                />
                                                <div className="gem-detail-itinerary-create-actions">
                                                    <button
                                                        type="button"
                                                        className="gem-detail-itinerary-create-cancel"
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
                                                        className="gem-detail-itinerary-create-submit"
                                                        disabled={!newItineraryName.trim() || creatingItinerary}
                                                    >
                                                        Create &amp; add
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <button
                                                type="button"
                                                className="gem-detail-itinerary-option gem-detail-itinerary-new"
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
                                    <p className={`gem-detail-itinerary-status ${itineraryStatus.type}`}>
                                        {itineraryStatus.message}
                                    </p>
                                )}
                            </div>
                        )}

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
                        Community Stories ({storyPosts.length})
                    </button>
                    <button
                        className={`gem-detail-tab ${activeTab === "comments" ? "active" : ""}`}
                        onClick={() => setActiveTab("comments")}
                    >
                        Ratings ({totalRatings})
                    </button>
                </div>

                <div className="gem-detail-content">

                {gem.report_status === "under_review" && Number(gem.user_id) !== Number(currentUser?.id) && (
                    <div className="report-banner">
                        <div className="report-banner-text">
                            <strong>This gem has a report under review</strong>
                            <p>Help the community confirm or dispute it — 5 votes either way settles it.</p>
                        </div>
                        <button
                            type="button"
                            className="report-banner-verify-btn"
                            onClick={handleHelpVerify}
                            disabled={loadingReport}
                        >
                            {loadingReport ? "Loading…" : "Help Verify"}
                        </button>
                    </div>
                )}

                {gem.report_status === "under_review" && Number(gem.user_id) === Number(currentUser?.id) && (
                    <div className="report-owner-banner">
                        <h3>⚠ Your gem has been reported</h3>
                        <p>The community is voting to confirm or dispute it. You'll be able to act once it's resolved.</p>
                    </div>
                )}

                {isClosed && (
                    <div className="report-owner-banner">
                        <h3>⚠ Marked permanently closed</h3>
                        <p>
                            The community confirmed this place has closed for good. It stays listed for
                            reference but is greyed out, and votes, ratings, comments and menu
                            items are frozen.
                        </p>
                        {Number(gem.user_id) === Number(currentUser?.id) && (
                            gem.status === "pending_community_vote" ? (
                                <p className="report-owner-countdown">
                                    If it has reopened, edit it from <Link to="/my-hidden-gems">My Hidden Gems</Link> —
                                    that counts as a fresh submission and goes through AI review and community
                                    voting again. You can also delete it there.
                                </p>
                            ) : (
                                <p className="report-owner-countdown">
                                    This gem was already verified, so it can no longer be edited or deleted —
                                    the closed listing stays as a permanent record.
                                </p>
                            )
                        )}
                    </div>
                )}

                {gem.status === "pending_community_vote" && gem.contact_edit_unlocked_at && !isClosed
                    && Number(gem.user_id) === Number(currentUser?.id) && (
                    <div className="report-owner-banner">
                        <h3>✎ The community confirmed a correction</h3>
                        <p>
                            Edit this gem from <Link to="/my-hidden-gems">My Hidden Gems</Link> to apply the
                            fix. Because it isn't verified yet, saving re-submits it — fresh AI review and a
                            new community vote. The proposed correction is shown above.
                        </p>
                    </div>
                )}

                {gem.edit_mode === "contact_only" && contactEdit && Number(gem.user_id) === Number(currentUser?.id) && (
                    <div className="report-owner-banner">
                        <h3>✎ Update your contact info</h3>
                        <p>
                            {gem.contact_edit_unlocked_at
                                ? "The community confirmed a report that the contact details are wrong. Correct the hours, phone and website below."
                                : "Keep your gem's hours, phone and website current. Changes here don't affect its verified status, votes or ratings."}
                        </p>
                        {gem.contact_edit_context?.description && (
                            <p className="report-owner-countdown">Reporter's note: "{gem.contact_edit_context.description}"</p>
                        )}
                        <div className="gem-detail-contact-edit">
                            <label>Opening hours</label>
                            <input
                                type="text"
                                value={contactEdit.opening_hours}
                                onChange={(e) => setContactEdit((c) => ({ ...c, opening_hours: e.target.value }))}
                                maxLength={255}
                            />
                            <label>Phone</label>
                            <input
                                type="text"
                                value={contactEdit.phone}
                                onChange={(e) => setContactEdit((c) => ({ ...c, phone: e.target.value }))}
                                maxLength={30}
                            />
                            <label>Website</label>
                            <input
                                type="url"
                                value={contactEdit.website}
                                onChange={(e) => setContactEdit((c) => ({ ...c, website: e.target.value }))}
                                maxLength={255}
                                placeholder="https://…"
                            />
                        </div>
                        <div className="report-owner-actions">
                            <button className="vote-btn-primary" onClick={handleSaveContactEdit} disabled={contactEditSaving}>
                                {contactEditSaving ? "Saving…" : "Save contact info"}
                            </button>
                        </div>
                        {contactEditMessage && <p className="vote-message success">{contactEditMessage}</p>}
                    </div>
                )}

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

                        {(gem.opening_hours || gem.phone || gem.website) && (
                            <div className="gem-detail-section-card">
                                <div className="gem-detail-section-header">
                                    <span className="gem-detail-section-icon">ℹ️</span>
                                    <h3>Contact Info</h3>
                                </div>
                                <div className="gem-detail-contact-list">
                                    {gem.opening_hours && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Hours</span>
                                            <span>{gem.opening_hours}</span>
                                        </div>
                                    )}
                                    {gem.phone && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Phone</span>
                                            <a href={`tel:${gem.phone}`}>{gem.phone}</a>
                                        </div>
                                    )}
                                    {gem.website && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Website</span>
                                            <a href={gem.website} target="_blank" rel="noopener noreferrer">{gem.website}</a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {gem.suggested_fix && (
                            <div className="gem-detail-section-card gem-detail-contact-suggested">
                                <p className="gem-detail-contact-suggested-title">
                                    {gem.suggested_fix.state === "confirmed"
                                        ? "Correction confirmed by the community"
                                        : "Proposed correction — under community review"}
                                </p>
                                <div className="gem-detail-contact-list">
                                    {gem.suggested_fix.latitude != null && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Location</span>
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${gem.suggested_fix.latitude},${gem.suggested_fix.longitude}`}
                                                target="_blank" rel="noopener noreferrer"
                                            >
                                                {Number(gem.suggested_fix.latitude).toFixed(5)}, {Number(gem.suggested_fix.longitude).toFixed(5)}
                                            </a>
                                        </div>
                                    )}
                                    {gem.suggested_fix.description && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Description</span>
                                            <span>{gem.suggested_fix.description}</span>
                                        </div>
                                    )}
                                    {gem.suggested_fix.opening_hours && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Hours</span>
                                            <span>{gem.suggested_fix.opening_hours}</span>
                                        </div>
                                    )}
                                    {gem.suggested_fix.phone && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Phone</span>
                                            <span>{gem.suggested_fix.phone}</span>
                                        </div>
                                    )}
                                    {gem.suggested_fix.website && (
                                        <div className="gem-detail-contact-row">
                                            <span className="gem-detail-contact-label">Website</span>
                                            <span>{gem.suggested_fix.website}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {gem.category?.name === "Food & Beverage" && (
                            <div className="gem-detail-section-card">
                                <div className="gem-detail-section-header">
                                    <span className="gem-detail-section-icon">🍽️</span>
                                    <h3>Menu Items</h3>
                                </div>
                                <MenuItems
                                    locationId={gem.id}
                                    currentUser={currentUser}
                                    onRequireSignIn={requireSignIn}
                                    frozen={isClosed}
                                />
                            </div>
                        )}

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
                                        style={{
                                            width: `${Math.min(
                                                ((gem.votes?.length || 0) /
                                                    (gem.verification_threshold || 10)) *
                                                    100,
                                                100
                                            )}%`,
                                        }}
                                    ></div>
                                </div>

                                <p className="gem-detail-progress-text">
                                    {gem.votes?.length || 0} of {gem.verification_threshold || 10} votes
                                    {" "}
                                    ({Math.max(
                                        (gem.verification_threshold || 10) -
                                            (gem.votes?.length || 0),
                                        0
                                    )} more needed)
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
                                <Link
                                    to={`/users/${gem.user?.id || ''}`}
                                    className="gem-detail-submitter-link"
                                    style={{ textDecoration: "none" }}
                                    onClick={(event) => {
                                        if (user) return;
                                        event.preventDefault();
                                        requireSignIn("Login to view this user's profile.");
                                    }}
                                >
                                    {gem.user?.name || "Unknown User"}
                                </Link>
                                <FavouriteAchievementBadges
                                    favourites={gem.user?.favourite_achievements}
                                    className="gem-detail-submitter-achievements"
                                />
                            </div>
                        </div>

                        {voteSuccess && activeTab === "details" && (
                            <p className="vote-message success gem-detail-vote-message">
                                {voteMessage || "Vote submitted successfully."}
                            </p>
                        )}

                        {/* Vote Button */}
                        {(isClosed || gem.status === "pending_community_vote" || gem.status === "delisted") && (
                            <div className="gem-detail-vote-section">
                                {isClosed ? (
                                    <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                        ⚠ Permanently closed
                                    </button>
                                ) : gem.status === "pending_community_vote" ? (
                                    <button
                                        className="gem-detail-vote-btn"
                                        onClick={() => {
                                            if (!currentUser) {
                                                requireSignIn("Login to vote on this hidden gem.");
                                                return;
                                            }

                                            setShowVoteModal(true);
                                        }}
                                    >
                                        🗳️ Vote Now
                                    </button>
                                ) : gem.status === "delisted" ? (
                                    <button className="gem-detail-vote-btn gem-detail-vote-btn-verified" disabled>
                                        ⚠ Delisted after a confirmed report
                                    </button>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}

                    {activeTab === "votes" && (
                    <div className="gem-detail-votes-list">
                        {gem.votes && gem.votes.length > 0 ? (
                            gem.votes.map((vote) => (
                                <div
                                    id={`vote-${vote.id}`}
                                    key={vote.id}
                                    className="gem-detail-vote-item"
                                >
                                    <div className="gem-detail-vote-avatar">
                                        {vote.user?.name?.charAt(0) || "U"}
                                    </div>

                                    <div className="gem-detail-vote-info">
                                        <p className="gem-detail-vote-user">
                                            {vote.user?.name || "Unknown User"}
                                        </p>

                                        <p className="gem-detail-vote-date">
                                            Voted on{" "}
                                            {new Date(vote.created_at).toLocaleDateString("en-GB", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="gem-detail-no-votes">
                                No votes yet. Be the first to vote!
                            </p>
                        )}
                    </div>
)}

                    {activeTab === "stories" && (
                        <div className="gem-detail-stories-list">
                            {storiesLoading ? (
                                <Spinner size="sm" inline label="Loading community stories…" />
                            ) : storiesError ? (
                                <p className="gem-detail-no-votes">{storiesError}</p>
                            ) : storyPosts.length === 0 ? (
                                <div className="gem-detail-empty-card">
                                    <p className="gem-detail-no-votes">
                                        No travel posts mention this gem yet. Be the first to write one!
                                    </p>
                                </div>
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
                                            <button
                                                className={`gem-filter-btn ${filterType === 'with_photo' ? 'active' : ''}`}
                                                onClick={() => { setFilterType('with_photo'); setRatingFilter(0); }}
                                            >
                                                With Photos ({interactions.comments?.filter(c => c.photo_path).length || 0})
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Rating + Comment Form */}
                            {isClosed ? (
                                <div className="gem-detail-already-commented">
                                    <p>This place is marked permanently closed — new ratings and comments are frozen.</p>
                                </div>
                            ) : isGemOwner ? (
                                <div className="gem-detail-already-commented">
                                    <p>You cannot rate or comment on your own Hidden Gem.</p>
                                </div>
                            ) : hasUserCommented ? (
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
                                    
                                    {/* Upload Photo */}
                                    <div className="gem-detail-comment-photo-upload">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleCommentPhotoChange}
                                            style={{ display: 'none' }}
                                            id="comment-photo-upload"
                                        />
                                        <label htmlFor="comment-photo-upload" className="gem-detail-comment-photo-btn">
                                            📷 Upload Photo
                                        </label>
                                        {commentPhotoPreview && (
                                            <div className="gem-detail-comment-photo-preview">
                                                <img src={commentPhotoPreview} alt="Preview" />
                                                <button type="button" onClick={() => {
                                                    setCommentPhoto(null);
                                                    setCommentPhotoPreview(null);
                                                }}>✕</button>
                                            </div>
                                        )}
                                    </div>

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
                                                            <div className="gem-detail-comment-photo-upload">
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={handleEditCommentPhotoChange}
                                                                    style={{ display: 'none' }}
                                                                    id={`edit-comment-photo-upload-${comment.id}`}
                                                                />

                                                                {!removeExistingCommentPhoto && !editCommentPhotoPreview && comment.photo_path && (
                                                                    <div className="gem-detail-comment-photo-preview">
                                                                        <img
                                                                            src={getVotePhotoUrl(comment.photo_path)}
                                                                            alt="Current comment photo"
                                                                        />
                                                                    </div>
                                                                )}

                                                                {editCommentPhotoPreview && (
                                                                    <div className="gem-detail-comment-photo-preview">
                                                                        <img src={editCommentPhotoPreview} alt="New preview" />
                                                                    </div>
                                                                )}

                                                                <label
                                                                    htmlFor={`edit-comment-photo-upload-${comment.id}`}
                                                                    className="gem-detail-comment-photo-btn"
                                                                >
                                                                    {comment.photo_path || editCommentPhotoPreview ? "Replace Photo" : "Upload Photo"}
                                                                </label>

                                                                {(comment.photo_path || editCommentPhotoPreview) && (
                                                                    <button
                                                                        type="button"
                                                                        className="gem-detail-comment-photo-remove-btn"
                                                                        disabled={commentActionLoading}
                                                                        onClick={() => {
                                                                            setEditCommentPhoto(null);
                                                                            setEditCommentPhotoPreview(null);
                                                                            setRemoveExistingCommentPhoto(true);
                                                                        }}
                                                                    >
                                                                        Remove Photo
                                                                    </button>
                                                                )}
                                                            </div>
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
                                                            {comment.photo_path && (
                                                                <div className="gem-detail-comment-photo-display">
                                                                    <img 
                                                                        src={getVotePhotoUrl(comment.photo_path)} 
                                                                        alt="Comment photo"
                                                                        onClick={() => setSelectedPhoto(comment.photo_path)}
                                                                    />
                                                                </div>
                                                            )}
                                                            {isOwnComment && !isEditing && canEdit && !isGemOwner && (
                                                                <span className="gem-detail-comment-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="gem-detail-comment-edit-btn"
                                                                        onClick={() => handleEditComment(comment)}
                                                                        disabled={commentActionLoading}
                                                                    >
                                                                        ✎
                                                                    </button>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    <p className="gem-detail-comment-date">
                                                        Rated on {createdAt.toLocaleDateString("en-GB", {
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
                                    <div className="gem-detail-empty-card">
                                        <p className="gem-detail-no-comments">
                                            {totalRatings > 0
                                                ? "No results match your filter."
                                                : "No ratings yet. Be the first to rate!"}
                                        </p>
                                    </div>
                                )}
                            </div>
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

            <VerifyReportModal
                report={activeReport}
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                onVerifySuccess={(data) => {
                    if (data?.location) {
                        setGem((prev) => (prev ? { ...prev, ...data.location } : prev));
                    }
                }}
            />

            {selectedPhoto && (
                <div className="photo-modal-overlay" onClick={() => setSelectedPhoto(null)}>
                    <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="photo-modal-close" onClick={() => setSelectedPhoto(null)}>✕</button>
                        <img 
                            src={getVotePhotoUrl(selectedPhoto)}
                            alt="Photo enlarged"
                            className="photo-modal-image"
                        />
                    </div>
                </div>
            )}

        </div>
    );
}