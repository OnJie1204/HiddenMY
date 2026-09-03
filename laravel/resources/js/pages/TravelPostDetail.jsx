import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTravelPostDetail, deleteTravelPost } from "../api/travelPosts";
import { getMe } from "../api/auth";
import Avatar from "../components/Avatar";
import PhotoCarousel from "../components/PhotoCarousel";
import Spinner from "../components/Spinner";
import FavouriteAchievementBadges from "../components/FavouriteAchievementBadges";
import SignInPrompt from "../components/SignInPrompt";

import "../styles/global.css";

export default function TravelPostDetail({ user }) {
    const { id } = useParams();
    const navigate = useNavigate();

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentUserId, setCurrentUserId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [showSignIn, setShowSignIn] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState(null);

    useEffect(() => {
        getMe().then((res) => setCurrentUserId(res.data.id)).catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        getTravelPostDetail(id)
            .then((res) => setPost(res.data.data))
            .catch((err) => {
                console.error("Error fetching travel post:", err);
                setError(err.response?.data?.message || "Failed to load this travel post.");
            })
            .finally(() => setLoading(false));
    }, [id]);

    async function handleDelete() {
        setDeleting(true);
        try {
            await deleteTravelPost(id);
            navigate("/travel-posts");
        } catch (err) {
            console.error("Error deleting travel post:", err);
            setDeleting(false);
        }
    }

    if (loading) {
        return <Spinner size="lg" label="Loading travel post…" />;
    }

    if (error || !post) {
        return (
            <div className="hidden-gems-empty">
                <p>{error || "Travel post not found."}</p>
            </div>
        );
    }

    const isOwner = currentUserId === post.user_id;

    return (
        <div className="gem-detail-page travel-post-detail-page">
            <div className="travel-post-toolbar">
                {isOwner && (
                    <div className="travel-post-owner-actions">
                        <button
                            type="button"
                            className="travel-post-icon-btn"
                            onClick={() => navigate(`/travel-posts/${post.id}/edit`)}
                            title="Edit post"
                            aria-label="Edit post"
                        >
                            ✏️
                        </button>
                        <button
                            type="button"
                            className="travel-post-icon-btn travel-post-icon-btn-danger"
                            onClick={() => setConfirmingDelete(true)}
                            title="Delete post"
                            aria-label="Delete post"
                        >
                            🗑️
                        </button>
                    </div>
                )}
            </div>

            {post.cover_image_url && (
                <div className="travel-post-cover-wrap">
                    <img src={post.cover_image_url} alt={post.title} className="travel-post-cover" />
                </div>
            )}

            <h1 className="travel-post-title">{post.title}</h1>

            <div className="travel-post-byline">
                <Avatar name={post.user?.name} avatarUrl={post.user?.avatar_url} size="sm" />
                <div>
                    <div className="travel-post-author-identity">
                        <p className="travel-post-byline-name">{post.user?.name || "Traveler"}</p>
                        <FavouriteAchievementBadges
                            favourites={post.user?.favourite_achievements}
                        />
                    </div>
                    <p className="travel-post-byline-meta">
                        {new Date(post.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                        })}
                        {post.trip_itinerary_id && (
                            <>
                                {" · "}
                                <span
                                    className="wishlist-link"
                                    onClick={() => {
                                        if (!user) {
                                            setShowSignIn(true);
                                            return;
                                        }
                                        navigate(`/trips/${post.trip_itinerary_id}`);
                                    }}
                                >
                                    View the trip
                                </span>
                            </>
                        )}
                    </p>
                </div>
            </div>

            <p className="travel-post-body">{post.body}</p>

            {post.images?.length > 0 && (
                <div className="travel-post-gallery">
                    <PhotoCarousel
                        images={post.images}
                        alt={post.title}
                        className="travel-post-carousel"
                        onImageClick={(url) => setLightboxUrl(url)}
                    />
                </div>
            )}

            {lightboxUrl && (
                <div className="photo-modal-overlay" onClick={() => setLightboxUrl(null)}>
                    <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="photo-modal-close" onClick={() => setLightboxUrl(null)}>✕</button>
                        <img src={lightboxUrl} alt="" className="photo-modal-image" />
                    </div>
                </div>
            )}

            {post.locations?.length > 0 && (
                <div className="travel-post-tagged-gems">
                    <h2 className="travel-post-section-title">Hidden Gems in this Story</h2>
                    <div className="hidden-gems-list">
                        {post.locations.map((location) => (
                            <div
                                key={location.id}
                                className="hidden-gems-card"
                                onClick={() => navigate(`/hidden-gems/${location.id}`)}
                            >
                                <div className="hidden-gems-card-image">
                                    <PhotoCarousel
                                        images={location.images || []}
                                        alt={location.place_name}
                                        compact
                                        fill
                                        showThumbs={false}
                                    />
                                </div>
                                <div className="hidden-gems-card-content">
                                    <h2>{location.place_name}</h2>
                                    <div className="hidden-gems-card-tags">
                                        <span className="hidden-gems-card-category">
                                            {location.category?.name || "Uncategorized"}
                                        </span>
                                        {location.pivot?.visited && (
                                            <span className="travel-post-visited-badge">Verified Visitor</span>
                                        )}
                                    </div>
                                    {location.pivot?.caption && (
                                        <p className="hidden-gems-card-description">{location.pivot.caption}</p>
                                    )}
                                    <button
                                        type="button"
                                        className="travel-post-map-btn"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            navigate("/map", {
                                                state: {
                                                    highlightGem: location,
                                                    highlightId: location.id,
                                                },
                                            });
                                        }}
                                    >
                                        📍 View on Map
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {confirmingDelete && (
                <div className="delete-modal-overlay" onClick={() => !deleting && setConfirmingDelete(false)}>
                    <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Delete Travel Post?</h2>
                        <p>Are you sure you want to delete this travel post? This action cannot be undone.</p>
                        <div className="delete-modal-actions">
                            <button
                                className="delete-modal-cancel"
                                onClick={() => setConfirmingDelete(false)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button className="delete-modal-confirm" onClick={handleDelete} disabled={deleting}>
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message="Login to view this trip itinerary."
            />
        </div>
    );
}
