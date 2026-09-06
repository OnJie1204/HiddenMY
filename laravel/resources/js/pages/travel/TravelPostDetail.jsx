import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTravelPostDetail, deleteTravelPost, copyPostTrip } from "@/features/travel/travelPostsApi";
import { getMe } from "@/features/auth/api";
import Avatar from "@/components/common/Avatar";
import PhotoCarousel from "@/components/common/PhotoCarousel";
import Spinner from "@/components/common/Spinner";
import FavouriteAchievementBadges from "@/components/achievements/FavouriteAchievementBadges";
import { useAuthPrompt } from "@/context/auth/AuthPromptContext";

import "@css/base/global.css";

export default function TravelPostDetail({ user }) {
    const { id } = useParams();
    const navigate = useNavigate();

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentUserId, setCurrentUserId] = useState(user?.id ?? null);
    const [deleting, setDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const { requireAuth } = useAuthPrompt();
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [copying, setCopying] = useState(false);
    const [copyResult, setCopyResult] = useState(null);

    useEffect(() => {
        getMe()
            .then((res) => setCurrentUserId(res.data.id))
            .catch((err) => {
                if (err?.response?.status === 401) setCurrentUserId(null);
            });
    }, []);

    useEffect(() => {
        setLoading(true);
        getTravelPostDetail(id)
            .then((res) => setPost(res.data.data))
            .catch((err) => {
                console.error("Error fetching travel post:", err);
                setError(
                    err.response?.status === 404
                        ? "Travel post not found."
                        : err.response?.data?.message || "Failed to load this travel post."
                );
            })
            .finally(() => setLoading(false));
    }, [id]);

    function handleAuthorClick(event) {
        // The /users/:id route is auth-gated, so prompt to sign in rather than
        // bouncing a guest straight to the login page.
        if (!user) {
            event.preventDefault();
            requireAuth({
                reason: "viewProfile",
                returnTo: `/users/${post.user.id}`,
            });
        }
    }

    async function handleCopyTrip() {
        if (!user) {
            requireAuth({ reason: "copyTrip" });
            return;
        }
        setCopying(true);
        setCopyResult(null);
        try {
            const res = await copyPostTrip(id);
            setCopyResult({ type: "success", message: res.data.message, tripId: res.data.data?.id });
        } catch (err) {
            setCopyResult({
                type: "error",
                message: err.response?.data?.message || "Could not copy this trip.",
            });
        } finally {
            setCopying(false);
        }
    }

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
        <div className="travel-post-detail-page">
            <article className="travel-post-article">
                {post.cover_image_url && (
                    <div className="travel-post-cover-wrap">
                        <img src={post.cover_image_url} alt={post.title} className="travel-post-cover" />
                    </div>
                )}

                <div className="travel-post-article-body">
                    <header className="travel-post-header">
                        <h1 className="travel-post-title">{post.title}</h1>

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
                    </header>

                    <div className="travel-post-byline">
                        {post.user?.id ? (
                            <Link to={`/users/${post.user.id}`} onClick={handleAuthorClick} aria-label={`View ${post.user?.name || "this traveler"}'s profile`}>
                                <Avatar name={post.user?.name} avatarUrl={post.user?.avatar_url} size="sm" />
                            </Link>
                        ) : (
                            <Avatar name={post.user?.name} avatarUrl={post.user?.avatar_url} size="sm" />
                        )}
                        <div className="travel-post-byline-info">
                            <div className="travel-post-author-identity">
                                {post.user?.id ? (
                                    <Link
                                        to={`/users/${post.user.id}`}
                                        className="travel-post-byline-name travel-post-byline-name-link"
                                        onClick={handleAuthorClick}
                                    >
                                        {post.user?.name || "Traveler"}
                                    </Link>
                                ) : (
                                    <p className="travel-post-byline-name">{post.user?.name || "Traveler"}</p>
                                )}
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
                            </p>
                        </div>

                        {post.stops?.length > 0 && (
                            <button
                                type="button"
                                className="travel-post-trip-link"
                                onClick={handleCopyTrip}
                                disabled={copying}
                                title="Copy this trip into your itineraries"
                            >
                                <span aria-hidden="true">🧭</span>
                                {copying ? "Copying…" : "Copy this trip"}
                            </button>
                        )}
                    </div>

                    {copyResult && (
                        <div className={`travel-post-copy-result ${copyResult.type}`}>
                            <span>{copyResult.message}</span>
                            {copyResult.tripId && (
                                <button type="button" onClick={() => navigate(`/trip-itinerary/${copyResult.tripId}`)}>
                                    Open it
                                </button>
                            )}
                        </div>
                    )}

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
                </div>
            </article>

            {lightboxUrl && (
                <div className="photo-modal-overlay" onClick={() => setLightboxUrl(null)}>
                    <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="photo-modal-close" onClick={() => setLightboxUrl(null)}>✕</button>
                        <img src={lightboxUrl} alt="" className="photo-modal-image" />
                    </div>
                </div>
            )}

            {post.stops?.length > 0 && (
                <div className="travel-post-tagged-gems">
                    <h2 className="travel-post-section-title">The Trip</h2>
                    <ol className="travel-post-stop-list">
                        {post.stops.map((stop) => {
                            const gem = stop.gem;
                            const closed = !!gem?.permanently_closed_at;
                            const clickable = gem && !stop.removed;

                            // What kind of place this stop is.
                            let kindLabel = "Place";
                            let kindClosed = false;
                            if (stop.removed) {
                                kindLabel = "No longer listed";
                                kindClosed = true;
                            } else if (closed) {
                                kindLabel = "Permanently closed";
                                kindClosed = true;
                            } else if (gem?.status === "hidden_gem") {
                                kindLabel = "Hidden gem";
                            } else if (gem?.status === "well_known") {
                                kindLabel = "Well-known place";
                            } else if (gem?.status === "pending_community_vote") {
                                kindLabel = "In community voting";
                            }

                            return (
                                <li
                                    key={stop.id}
                                    className={`travel-post-stop${closed ? " is-closed" : ""}${stop.removed ? " is-removed" : ""}`}
                                >
                                    <span className="travel-post-stop-rank">{stop.order_number + 1}</span>
                                    <div className="travel-post-stop-body">
                                        <div className="travel-post-stop-head">
                                            {clickable ? (
                                                <button
                                                    type="button"
                                                    className="travel-post-stop-name-link"
                                                    onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                                                >
                                                    {stop.name}
                                                </button>
                                            ) : (
                                                <span className="travel-post-stop-name">{stop.name}</span>
                                            )}
                                            <span className={`travel-post-stop-tag${kindClosed ? " is-closed" : ""}`}>
                                                {kindLabel}
                                            </span>
                                        </div>
                                        <span className="travel-post-stop-meta">
                                            {[gem?.category, gem?.state].filter(Boolean).join(" · ")}
                                            {stop.source_trip ? ` · from "${stop.source_trip}"` : ""}
                                        </span>
                                        {stop.caption && <p className="travel-post-stop-caption">{stop.caption}</p>}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
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
        </div>
    );
}
