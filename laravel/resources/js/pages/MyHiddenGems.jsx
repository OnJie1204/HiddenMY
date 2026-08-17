import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyHiddenGems, deleteHiddenGem } from "../api/hiddenGems";
import GemImage from "../components/GemImage";

import "../styles/global.css";

export default function MyHiddenGems() {
    const navigate = useNavigate();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

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
                                        onClick={() => setDeleteId(gem.id)}
                                    >
                                        Delete
                                    </button>

                                </div>

                            </div>
                        </div>
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
