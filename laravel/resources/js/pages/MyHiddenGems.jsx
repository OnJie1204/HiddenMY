import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
    getMyHiddenGems,
    deleteHiddenGem,
    getCategories,
    getStates,
} from "../api/hiddenGems";
import { getMyVotes } from "../api/votes";
import { getMyRatings } from "../api/gemInteractions";
import GemImage from "../components/GemImage";
import HiddenGemJourneyMap from "../components/HiddenGemJourneyMap";
import HiddenMYAchievements from "../components/HiddenMYAchievements";
import { getGemStatusDisplay, voteProgressLabel } from "../utils/gemStatus";

import "../styles/global.css";

const MY_VOTES_SORT_KEY = "myVotesSortOrder";
const MY_RATINGS_SORT_KEY = "myRatingsSortOrder";

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
    const [searchParams, setSearchParams] = useSearchParams();

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [activeTab, setActiveTab] = useState(() =>
        ["votes", "contributions"].includes(routeLocation.state?.activeTab)
            ? "contributions"
            : "hidden-gems"
    );
    const [contributionTab, setContributionTab] = useState(
        routeLocation.state?.contributionTab === "ratings" ? "ratings" : "votes"
    );
    const [votes, setVotes] = useState([]);
    const [votesLoading, setVotesLoading] = useState(false);
    const [votesError, setVotesError] = useState("");
    const [votesLoaded, setVotesLoaded] = useState(false);
    const [voteSortOrder, setVoteSortOrder] = useState(() =>
        sessionStorage.getItem(MY_VOTES_SORT_KEY) === "oldest"
            ? "oldest"
            : "newest"
    );
    const [ratings, setRatings] = useState([]);
    const [ratingsLoading, setRatingsLoading] = useState(false);
    const [ratingsError, setRatingsError] = useState("");
    const [ratingsLoaded, setRatingsLoaded] = useState(false);
    const [ratingSortOrder, setRatingSortOrder] = useState(() =>
        sessionStorage.getItem(MY_RATINGS_SORT_KEY) === "oldest"
            ? "oldest"
            : "newest"
    );
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesLoaded, setCategoriesLoaded] = useState(false);
    const [categoriesError, setCategoriesError] = useState("");
    const [states, setStates] = useState([]);

    const filters = {
        status: searchParams.get("status") || "",
        category: searchParams.get("category") || "",
        state: searchParams.get("state") || "",
    };

    const filteredGems = gems.filter((gem) =>
        (!filters.status || gem.status === filters.status)
        && (!filters.category || String(gem.category_id) === filters.category)
        && (!filters.state || gem.state === filters.state)
    );

    const sortedVotes = [...votes].sort((firstVote, secondVote) => {
        const firstDate = new Date(firstVote.created_at).getTime();
        const secondDate = new Date(secondVote.created_at).getTime();
        const firstDateIsValid = Number.isFinite(firstDate);
        const secondDateIsValid = Number.isFinite(secondDate);

        if (!firstDateIsValid && !secondDateIsValid) return 0;
        if (!firstDateIsValid) return 1;
        if (!secondDateIsValid) return -1;

        return voteSortOrder === "oldest"
            ? firstDate - secondDate
            : secondDate - firstDate;
    });

    const sortedRatings = [...ratings].sort((firstRating, secondRating) => {
        const firstDate = new Date(firstRating.created_at).getTime();
        const secondDate = new Date(secondRating.created_at).getTime();
        const firstDateIsValid = Number.isFinite(firstDate);
        const secondDateIsValid = Number.isFinite(secondDate);

        if (!firstDateIsValid && !secondDateIsValid) return 0;
        if (!firstDateIsValid) return 1;
        if (!secondDateIsValid) return -1;

        return ratingSortOrder === "oldest"
            ? firstDate - secondDate
            : secondDate - firstDate;
    });

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
        getCategories()
            .then((categoryResponse) => {
                setCategories(categoryResponse.data.data || []);
                setCategoriesLoaded(true);
            })
            .catch((error) => {
                console.error("Error fetching Hidden Gem categories:", error);
                setCategoriesError(
                    error.response?.data?.message || "Failed to load categories."
                );
            })
            .finally(() => setCategoriesLoading(false));

        getStates()
            .then((stateResponse) => {
                setStates(stateResponse.data.data || []);
            })
            .catch((error) => {
                console.error("Error fetching Hidden Gem states:", error);
            });
    }, []);

    const updateFilter = (name, value) => {
        const nextParams = new URLSearchParams(searchParams);

        if (value) {
            nextParams.set(name, value);
        } else {
            nextParams.delete(name);
        }

        setSearchParams(nextParams, { replace: true });
    };

    const updateVoteSortOrder = (value) => {
        setVoteSortOrder(value);
        sessionStorage.setItem(MY_VOTES_SORT_KEY, value);
    };

    const updateRatingSortOrder = (value) => {
        setRatingSortOrder(value);
        sessionStorage.setItem(MY_RATINGS_SORT_KEY, value);
    };

    const loadMyVotes = async () => {
        if (votesLoaded || votesLoading) return;

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

    const loadMyRatings = async () => {
        if (ratingsLoaded || ratingsLoading) return;

        setRatingsLoading(true);
        setRatingsError("");

        try {
            const response = await getMyRatings();
            setRatings(response.data.data || []);
            setRatingsLoaded(true);
        } catch (error) {
            console.error("Error fetching my ratings:", error);
            setRatingsError(
                error.response?.data?.message
                || "Failed to load your ratings."
            );
        } finally {
            setRatingsLoading(false);
        }
    };

    const showMyVotes = () => {
        setActiveTab("contributions");
        setContributionTab("votes");
        loadMyVotes();
    };

    const showMyRatings = () => {
        setActiveTab("contributions");
        setContributionTab("ratings");
        loadMyRatings();
    };

    const showContributions = () => {
        if (contributionTab === "ratings") {
            showMyRatings();
            return;
        }

        showMyVotes();
    };

    const showAchievements = () => {
        setActiveTab("achievements");
        loadMyVotes();
    };

    useEffect(() => {
        if (["votes", "contributions"].includes(routeLocation.state?.activeTab)) {
            if (routeLocation.state?.contributionTab === "ratings") {
                showMyRatings();
            } else {
                showMyVotes();
            }
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
                    <h1>{{
                        "hidden-gems": "My Hidden Gems",
                        contributions: "My Contributions",
                        achievements: "My Achievements",
                    }[activeTab]}</h1>
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
                    className={activeTab === "contributions" ? "active" : ""}
                    onClick={showContributions}
                >
                    My Contributions
                </button>
                <button
                    type="button"
                    className={activeTab === "achievements" ? "active" : ""}
                    onClick={showAchievements}
                >
                    My Achievements
                </button>
            </div>

            {activeTab === "contributions" && (
                <div className="my-contributions-tabs" aria-label="Contribution type">
                    <button
                        type="button"
                        className={contributionTab === "votes" ? "active" : ""}
                        onClick={showMyVotes}
                    >
                        My Votes
                    </button>
                    <button
                        type="button"
                        className={contributionTab === "ratings" ? "active" : ""}
                        onClick={showMyRatings}
                    >
                        My Ratings
                    </button>
                </div>
            )}

            {activeTab === "achievements" && (
                <HiddenMYAchievements
                    gems={gems}
                    gemsLoaded={!loading && !error}
                    votes={votes}
                    votesLoading={votesLoading}
                    votesLoaded={votesLoaded}
                    votesError={votesError}
                    categories={categories}
                    categoriesLoading={categoriesLoading}
                    categoriesLoaded={categoriesLoaded}
                    categoriesError={categoriesError}
                />
            )}

            {activeTab === "hidden-gems" && (
                <HiddenGemJourneyMap
                    gems={gems}
                    selectedRegion={filters.state}
                    onRegionSelect={(region) =>
                        updateFilter(
                            "state",
                            filters.state === region ? "" : region
                        )
                    }
                    onViewDetails={(gemId) => navigate(`/hidden-gems/${gemId}`)}
                />
            )}

            {activeTab === "hidden-gems" && (
                <div className="hidden-gems-filters">
                    <select
                        className="hidden-gems-filter-select"
                        value={filters.status}
                        onChange={(event) => updateFilter("status", event.target.value)}
                    >
                        <option value="">All Status</option>
                        <option value="pending">Being Verified</option>
                        <option value="ai_rejected">Not Accepted</option>
                        <option value="pending_community_vote">Awaiting Votes</option>
                        <option value="hidden_gem">Hidden Gem</option>
                    </select>

                    <select
                        className="hidden-gems-filter-select"
                        value={filters.category}
                        onChange={(event) => updateFilter("category", event.target.value)}
                    >
                        <option value="">All Categories</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="hidden-gems-filter-select"
                        value={filters.state}
                        onChange={(event) => updateFilter("state", event.target.value)}
                    >
                        <option value="">All States</option>
                        {states.map((state) => (
                            <option key={state} value={state}>
                                {state}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {activeTab === "contributions" && (
                <div className="hidden-gems-filters">
                    <select
                        className="hidden-gems-filter-select"
                        value={contributionTab === "votes" ? voteSortOrder : ratingSortOrder}
                        onChange={(event) => contributionTab === "votes"
                            ? updateVoteSortOrder(event.target.value)
                            : updateRatingSortOrder(event.target.value)}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>
            )}

            {activeTab === "achievements" ? null : activeTab === "hidden-gems" ? (loading ? (
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
                        + Hidden Gem
                    </button>
                </div>

            ) : filteredGems.length === 0 ? (

                <div className="hidden-gems-empty">
                    <h2>No Matching Hidden Gems</h2>
                    <p>No hidden gems match the selected filters.</p>
                </div>

            ) : (

                <div className="hidden-gems-list">

                    {filteredGems.map((gem) => (
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
                                    {gem.status === "ai_rejected" ? (
                                        <span
                                            className={getGemStatusDisplay(gem).badgeClass}
                                            title={gem.ai_review_reason || ""}
                                        >
                                            {getGemStatusDisplay(gem).label}
                                            {gem.ai_review_reason
                                                ? `: ${gem.ai_review_reason}`
                                                : ""}
                                        </span>
                                    ) : gem.status === "pending_community_vote" ? (
                                        <span className={getGemStatusDisplay(gem).badgeClass}>
                                            {voteProgressLabel(gem)}
                                        </span>
                                    ) : (
                                        <span className={getGemStatusDisplay(gem).badgeClass}>
                                            {getGemStatusDisplay(gem).label}
                                        </span>
                                    )}
                                </div>

                                <div
                                    className="my-hidden-gems-actions"
                                    onClick={(event) => event.stopPropagation()}
                                >

                                    {["pending", "ai_rejected", "pending_community_vote"].includes(gem.status)
                                        && Number(gem.vote_count) === 0 && (
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
            )) : contributionTab === "votes" ? (votesLoading ? (
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
                    {sortedVotes.map((vote) => (
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
            )) : ratingsLoading ? (
                <div className="hidden-gems-loading">
                    <p>Loading your ratings...</p>
                </div>
            ) : ratingsError ? (
                <div className="hidden-gems-empty">
                    <p>{ratingsError}</p>
                </div>
            ) : ratings.length === 0 ? (
                <div className="hidden-gems-empty">
                    <h2>No Ratings Yet</h2>
                    <p>You have not rated any hidden gems yet.</p>
                </div>
            ) : (
                <div className="my-votes-feed">
                    {sortedRatings.map((rating) => (
                        <article
                            key={rating.id}
                            className="my-vote-card"
                            onClick={() => navigate(
                                `/hidden-gems/${rating.location?.id}`,
                                {
                                    state: {
                                        openTab: "comments",
                                        interactionId: rating.id,
                                        fromMyRatings: true,
                                    },
                                }
                            )}
                        >
                            <div className="my-vote-card-content">
                                <div className="my-vote-card-header">
                                    <h2>{rating.location?.place_name || "Hidden Gem"}</h2>
                                    <time>
                                        {new Date(rating.created_at).toLocaleDateString(
                                            "en-GB",
                                            {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            }
                                        )}
                                    </time>
                                </div>
                                <div
                                    className="my-rating-stars"
                                    aria-label={`${rating.rating} out of 5 stars`}
                                >
                                    {"★".repeat(rating.rating || 0)}
                                    {"☆".repeat(Math.max(0, 5 - (rating.rating || 0)))}
                                </div>
                                <p>{rating.comment || "No comment"}</p>
                            </div>

                            {rating.location?.first_image?.image_url && (
                                <GemImage
                                    src={rating.location.first_image.image_url}
                                    alt={rating.location?.place_name || "Hidden Gem"}
                                    className="my-vote-thumbnail"
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
