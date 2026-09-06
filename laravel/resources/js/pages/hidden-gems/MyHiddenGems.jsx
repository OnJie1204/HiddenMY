import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MdOutlineReportProblem } from "react-icons/md";
import {
    getMyHiddenGems,
    getMyHiddenGemJourney,
    deleteHiddenGem,
    getCategories,
    getStates,
} from "@/features/hidden-gems/api";
import { getMyVotes } from "@/features/community/votesApi";
import { getMyRatings } from "@/features/community/interactionsApi";
import GemImage from "@/components/hidden-gems/GemImage";
import PhotoCarousel from "@/components/common/PhotoCarousel";
import LoadingCards from "@/components/common/LoadingCards";
import HiddenGemJourneyMap from "@/components/achievements/HiddenGemJourneyMap";
import HiddenMYAchievements from "@/components/achievements/HiddenMYAchievements";
import { getGemStatusDisplay, voteProgressLabel } from "@/utils/hidden-gems/gemStatus";
import { matchesMyHiddenGemFilters } from "@/utils/achievements/journey";
import {
    contributionTargetPath,
    isContributionTargetAvailable,
    UNAVAILABLE_LOCATION_MESSAGE,
} from "@/utils/hidden-gems/contributionHistory";
import {
    DELETE_SUCCESS_MESSAGE,
    deleteFailureMessage,
    removeDeletedGem,
} from "@/utils/hidden-gems/deleteFeedback";

import "@css/base/global.css";

const MY_VOTES_SORT_KEY = "myVotesSortOrder";
const MY_RATINGS_SORT_KEY = "myRatingsSortOrder";

export default function MyHiddenGems() {
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const [gems, setGems] = useState([]);
    const [journeyGems, setJourneyGems] = useState([]);
    const [journeyRegions, setJourneyRegions] = useState([]);
    const [journeyLoaded, setJourneyLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [deleteFeedback, setDeleteFeedback] = useState(null);
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
    const hasActiveFilters = Boolean(
        filters.status || filters.category || filters.state
    );

    const filteredGems = gems.filter((gem) => matchesMyHiddenGemFilters(gem, filters));

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

    const fetchJourney = async () => {
        try {
            const response = await getMyHiddenGemJourney();
            setJourneyGems(response.data.data || []);
            setJourneyRegions(response.data.discovered_regions || []);
            setJourneyLoaded(true);
        } catch (error) {
            console.error("Error fetching HiddenMY Journey:", error);
            setJourneyLoaded(false);
        }
    };

    useEffect(() => {
        fetchMyHiddenGems();
        fetchJourney();
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

    const clearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        ["status", "category", "state"].forEach((name) => {
            nextParams.delete(name);
        });
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

    // Flash message passed from the submission form after a successful submit.
    useEffect(() => {
        if (routeLocation.state?.flash) {
            setSuccessMessage(routeLocation.state.flash);
            navigate(routeLocation.pathname, { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage("");
            }, 4000);

            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (!deleteFeedback) return undefined;

        const timer = setTimeout(() => setDeleteFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [deleteFeedback]);

    const gemToDelete = gems.find((gem) => gem.id === deleteId);
    const willArchive = Boolean(
        gemToDelete?.permanently_closed_at &&
        ["hidden_gem", "well_known"].includes(gemToDelete.status)
    );

    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);
        setDeleteFeedback(null);
        setSuccessMessage("");

        try {
            await deleteHiddenGem(deleteId);

            setGems((prev) => removeDeletedGem(prev, deleteId));

            setDeleteId(null);
            await fetchJourney();

            setDeleteFeedback({ type: "success", message: DELETE_SUCCESS_MESSAGE });

        } catch (error) {
            console.error("Delete failed:", error);

            setDeleteId(null);

            setDeleteFeedback({ type: "error", message: deleteFailureMessage(error) });

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
                    gems={journeyGems}
                    gemsLoaded={journeyLoaded}
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
                    gems={journeyGems}
                    permanentDiscoveredRegions={journeyRegions}
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
                        <option value="pending_community_vote">Awaiting Community Votes</option>
                        <option value="hidden_gem">Hidden Gem</option>
                        <option value="well_known">Well-Known Place</option>
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

                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="hidden-gems-filter-clear hidden-gems-filter-clear-active"
                            onClick={clearFilters}
                        >
                            <span aria-hidden="true">✕</span> Clear Filters
                        </button>
                    )}
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
                <LoadingCards count={6} />
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
                            className={`hidden-gems-card${gem.permanently_closed_at ? " gem-card-closed" : ""}`}
                            key={gem.id}
                            onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                        >
                            <div className="hidden-gems-card-image">
                                <PhotoCarousel
                                    images={gem.images || []}
                                    alt={gem.place_name}
                                    compact
                                    fill
                                    showThumbs={false}
                                />
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
                                            {getGemStatusDisplay(gem).label} · {voteProgressLabel(gem)}
                                        </span>
                                    ) : (
                                        <span className={getGemStatusDisplay(gem).badgeClass}>
                                            {getGemStatusDisplay(gem).label}
                                        </span>
                                    )}
                                    {gem.has_active_report && (
                                        <span className="my-hidden-gem-report-indicator">
                                            <MdOutlineReportProblem aria-hidden="true" />
                                            Report Under Review
                                        </span>
                                    )}
                                </div>

                                <div
                                    className="my-hidden-gems-actions"
                                    onClick={(event) => event.stopPropagation()}
                                >

                                    {gem.can_edit && (
                                        <button
                                            className="my-hidden-gems-edit-btn"
                                            onClick={() =>
                                                navigate(gem.edit_mode === "verified"
                                                    ? `/hidden-gems/${gem.id}`
                                                    : `/my-hidden-gems/edit/${gem.id}`)
                                            }
                                        >
                                            {gem.edit_mode === "verified" ? "Edit info" : "Edit"}
                                        </button>
                                    )}

                                    {gem.can_delete && (
                                        <button
                                            className="my-hidden-gems-delete-btn"
                                            onClick={() => setDeleteId(gem.id)}
                                        >
                                            Delete
                                        </button>
                                    )}

                                </div>

                            </div>
                        </div>
                    ))}

                </div>
            )) : contributionTab === "votes" ? (votesLoading ? (
                <LoadingCards count={4} />
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
                    {sortedVotes.map((vote) => {
                        const locationAvailable = isContributionTargetAvailable(vote);

                        return (
                        <article
                            key={vote.id}
                            className={`my-vote-card${locationAvailable ? "" : " is-unavailable"}`}
                            onClick={locationAvailable ? () => navigate(
                                contributionTargetPath(vote),
                                {
                                    state: {
                                        openTab: "votes",
                                        voteId: vote.id,
                                        fromMyVotes: true,
                                        returnTo: {
                                            pathname: "/my-hidden-gems",
                                            state: {
                                                activeTab: "contributions",
                                                contributionTab: "votes",
                                            },
                                        },
                                    },
                                }
                            ) : undefined}
                        >
                            <div className="my-vote-card-content" style={{ alignSelf: "stretch" }}>
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
                                {!locationAvailable && <p>{UNAVAILABLE_LOCATION_MESSAGE}</p>}
                            </div>

                            {vote.location?.first_image?.image_url && (
                                <GemImage
                                    src={vote.location.first_image.image_url}
                                    alt={vote.location?.place_name || "Hidden Gem"}
                                    className="my-vote-thumbnail"
                                />
                            )}
                        </article>
                        );
                    })}
                </div>
            )) : ratingsLoading ? (
                <LoadingCards count={4} />
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
                    {sortedRatings.map((rating) => {
                        const locationAvailable = isContributionTargetAvailable(rating);

                        return (
                        <article
                            key={rating.id}
                            className={`my-vote-card${locationAvailable ? "" : " is-unavailable"}`}
                            onClick={locationAvailable ? () => navigate(
                                contributionTargetPath(rating),
                                {
                                    state: {
                                        openTab: "comments",
                                        interactionId: rating.id,
                                        fromMyRatings: true,
                                        returnTo: {
                                            pathname: "/my-hidden-gems",
                                            state: {
                                                activeTab: "contributions",
                                                contributionTab: "ratings",
                                            },
                                        },
                                    },
                                }
                            ) : undefined}
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
                                {!locationAvailable && <p>{UNAVAILABLE_LOCATION_MESSAGE}</p>}
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
                        );
                    })}
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

                        <p>{willArchive
                            ? "Are you sure you want to delete this Hidden Gem? It will remain in your Journey history."
                            : "Are you sure you want to delete this Hidden Gem? This action cannot be undone."}
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

            {deleteFeedback ? (
                <div
                    className={`hidden-gem-snackbar hidden-gem-snackbar-${deleteFeedback.type}`}
                    role={deleteFeedback.type === "error" ? "alert" : "status"}
                >
                    {deleteFeedback.message}
                </div>
            ) : successMessage && (
                <div className="hidden-gem-snackbar">
                    {successMessage}
                </div>
            )}
        </div>
    );
}
