import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getMyHiddenGems, deleteHiddenGem } from "../api/hiddenGems";
import { getMyVotes } from "../api/votes";
import GemImage from "../components/GemImage";

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

export default function MyHiddenGems() {
    const navigate = useNavigate();
    const routeLocation = useLocation();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [activeTab, setActiveTab] = useState(
        routeLocation.state?.activeTab === "votes" ? "votes" : "hidden-gems"
    );
    const [votes, setVotes] = useState([]);
    const [votesLoading, setVotesLoading] = useState(false);
    const [votesError, setVotesError] = useState("");
    const [votesLoaded, setVotesLoaded] = useState(false);

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

    const showMyVotes = async () => {
        setActiveTab("votes");

        if (votesLoaded) return;

        setVotesLoading(true);
        setVotesError("");

        try {
            const response = await getMyVotes();
            setVotes(response.data.data || []);
            setVotesLoaded(true);
        } catch (error) {
            console.error("Error fetching my votes:", error);
            setVotesError(
                error.response?.data?.message ||
                "Failed to load your votes."
            );
        } finally {
            setVotesLoading(false);
        }
    };

    useEffect(() => {
        if (routeLocation.state?.activeTab === "votes") {
            showMyVotes();
        }
    }, []);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage("");
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);

        try {
            await deleteHiddenGem(deleteId);

            setGems((prev) =>
                prev.filter((gem) => gem.id !== deleteId)
            );

            setDeleteId(null);

            setSuccessMessage("Hidden gem deleted successfully.");

        } catch (error) {
            console.error("Delete failed:", error);

            setDeleteId(null);

            setSuccessMessage(
                error.response?.data?.message ||
                "Failed to delete hidden gem."
            );

        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="hidden-gems-page">

            <div className="hidden-gems-header">
                <div>
                    <h1>📍 My Hidden Gems</h1>
                </div>

                <button
                    className="hidden-gems-submit-btn"
                    onClick={() => navigate("/hidden-gems/create")}
                >
                    + Hidden Gem
                </button>
            </div>

            <div className="my-hidden-gems-tabs">
                <button
                    type="button"
                    className={activeTab === "hidden-gems" ? "active" : ""}
                    onClick={() => setActiveTab("hidden-gems")}
                >
                    My Hidden Gems
                </button>
                <button
                    type="button"
                    className={activeTab === "votes" ? "active" : ""}
                    onClick={showMyVotes}
                >
                    My Votes
                </button>
            </div>

            {activeTab === "hidden-gems" ? (loading ? (
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
                            onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                        >
                            <div className="hidden-gems-card-image">
                                <GemImage src={gem.images?.[0]?.image_url} alt={gem.place_name} />
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
                                    ) : (
                                        <span className="hidden-gems-card-pending">
                                            Pending (
                                            {gem.vote_count || 0}/
                                            {gem.verification_threshold || 10}
                                            votes)
                                        </span>
                                    )}
                                </div>

                                <div
                                    className="my-hidden-gems-actions"
                                    onClick={(event) => event.stopPropagation()}
                                >

                                    {gem.status === "pending" && (
                                        <button
                                            className="my-hidden-gems-edit-btn"
                                            onClick={() =>
                                                navigate(`/my-hidden-gems/edit/${gem.id}`)
                                            }
                                        >
                                            Edit
                                        </button>
                                    )}

                                    <button
                                        className="my-hidden-gems-delete-btn"
                                        onClick={() => setDeleteId(gem.id)}
                                    >
                                        Delete
                                    </button>

                                </div>

                            </div>
                        </div>
                    ))}

                </div>
            )) : votesLoading ? (
                <div className="hidden-gems-loading">
                    <p>Loading your votes...</p>
                </div>
            ) : votesError ? (
                <div className="hidden-gems-empty">
                    <p>{votesError}</p>
                </div>
            ) : votes.length === 0 ? (
                <div className="hidden-gems-empty">
                    <h2>No Votes Yet</h2>
                    <p>You have not voted for any hidden gems yet.</p>
                </div>
            ) : (
                <div className="my-votes-feed">
                    {votes.map((vote) => (
                        <article
                            key={vote.id}
                            className="my-vote-card"
                            onClick={() => navigate(
                                `/hidden-gems/${vote.location?.id}`,
                                {
                                    state: {
                                        openTab: "votes",
                                        voteId: vote.id,
                                        fromMyVotes: true,
                                    },
                                }
                            )}
                        >
                            <div className="my-vote-card-content">
                                <div className="my-vote-card-header">
                                    <h2>
                                        {vote.location?.place_name || "Hidden Gem"}
                                    </h2>
                                    <time>
                                        {new Date(vote.created_at).toLocaleDateString(
                                            "en-GB",
                                            {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            }
                                        )}
                                    </time>
                                </div>
                                <p>{vote.comment || "No comment"}</p>
                            </div>

                            {vote.photo_path && (
                                <img
                                    src={getVotePhotoUrl(vote.photo_path)}
                                    alt="Your vote"
                                    className="my-vote-thumbnail"
                                    onError={(event) => {
                                        event.currentTarget.style.display = "none";
                                    }}
                                />
                            )}
                        </article>
                    ))}
                </div>
            )}
            
            {deleteId && (
                <div
                    className="delete-modal-overlay"
                    onClick={() => !deleting && setDeleteId(null)}
                >
                    <div
                        className="delete-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="delete-modal-icon">
                            🗑️
                        </div>

                        <h2>Delete Hidden Gem?</h2>

                        <p>
                            Are you sure you want to delete this hidden gem?
                            This action cannot be undone.
                        </p>

                        <div className="delete-modal-actions">

                            <button
                                className="delete-modal-cancel"
                                onClick={() => setDeleteId(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>

                            <button
                                className="delete-modal-confirm"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>

                        </div>
                    </div>
                </div>
            )}

            {successMessage && (
                <div className="hidden-gem-snackbar">
                    {successMessage}
                </div>
            )}
        </div>
    );
}
