import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getHiddenGems, getCategories, getStates } from "../api/hiddenGems";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";
import TruncatedText from "../components/TruncatedText";
import PhotoCarousel from "../components/PhotoCarousel";
import LoadingCards from "../components/LoadingCards";
import ReportButton from "../components/ReportButton";
import SignInPrompt from "../components/SignInPrompt";

import "../styles/global.css";

const ITEMS_PER_PAGE = 9;

export default function HiddenGems({ user }) {
    const navigate = useNavigate();
    const location = useLocation();

    const queryParams = new URLSearchParams(location.search);

    const initialSearch = queryParams.get("search") || "";
    const initialStatus = queryParams.get("status") || "";
    const initialCategory = queryParams.get("category") || "";
    const initialState = queryParams.get("state") || "";
    const initialSort = queryParams.get("sort") || "latest";
    const initialPage = Number(queryParams.get("page")) || 1;

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState(initialSearch);

    const [filter, setFilter] = useState({
        status: initialStatus,
        category: initialCategory,
        state: initialState,
        sort: initialSort,
    });

    const [categories, setCategories] = useState([]);
    const [states, setStates] = useState([]);

    const [totalResults, setTotalResults] = useState(0);
    const [lastSearch, setLastSearch] = useState("");

    const [currentPage, setCurrentPage] = useState(initialPage);
    const [lastPage, setLastPage] = useState(1);

    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistBusyId, setWishlistBusyId] = useState(null);

    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");

    const requireSignIn = (message) => {
        setSignInMessage(message);
        setShowSignIn(true);
    };

    const fetchGems = async () => {
        setLoading(true);

        try {
            const params = {
                page: currentPage,
                per_page: ITEMS_PER_PAGE,
            };

            if (search) {
                params.search = search;
            }

            let statusParam = filter.status;

            if (statusParam === "verified") {
                statusParam = "hidden_gem";
            }

            if (statusParam === "pending") {
                statusParam = "pending_community_vote";
            }

            if (statusParam) {
                params.status = statusParam;
            }

            if (filter.category) {
                params.category = filter.category;
            }

            if (filter.state) {
                params.state = filter.state;
            }

            if (filter.sort) {
                params.sort = filter.sort;
            }

            const response = await getHiddenGems(params);

            console.log("API Response:", response.data);

            setGems(response.data.data || []);
            setTotalResults(response.data.total || 0);
            setCurrentPage(response.data.current_page || currentPage);
            setLastPage(response.data.last_page || 1);
            setLastSearch(search);
        } catch (error) {
            console.error("Error fetching gems:", error);

            setGems([]);
            setTotalResults(0);
            setLastPage(1);
        } finally {
            setLoading(false);
        }
    };

    const fetchFilters = async () => {
        try {
            const [catRes, stateRes] = await Promise.all([
                getCategories(),
                getStates(),
            ]);

            setCategories(catRes.data.data || []);
            setStates(stateRes.data.data || []);
        } catch (error) {
            console.error("Error fetching filters:", error);
        }
    };

    const updateURL = () => {
        const params = new URLSearchParams();

        if (search) {
            params.set("search", search);
        }

        if (filter.status) {
            params.set("status", filter.status);
        }

        if (filter.category) {
            params.set("category", filter.category);
        }

        if (filter.state) {
            params.set("state", filter.state);
        }

        if (filter.sort && filter.sort !== "latest") {
            params.set("sort", filter.sort);
        }

        if (currentPage > 1) {
            params.set("page", currentPage);
        }

        const url = params.toString()
            ? `/hidden-gems?${params.toString()}`
            : "/hidden-gems";

        navigate(url, { replace: true });
    };

    useEffect(() => {
        updateURL();
    }, [filter, currentPage]);

    useEffect(() => {
        if (initialSearch) {
            setSearch(initialSearch);
        }
    }, [initialSearch]);

    useEffect(() => {
        fetchGems();
    }, [search, filter, currentPage]);

    useEffect(() => {
        fetchFilters();
    }, []);

    useEffect(() => {
        if (!user) {
            return;
        }

        getWishlist()
            .then((res) => {
                setWishlistIds(
                    new Set((res.data.data || []).map((gem) => gem.id))
                );
            })
            .catch((err) => {
                console.error("Error fetching wishlist:", err);
            });
    }, [user]);

    const handleToggleWishlist = async (e, gem) => {
        e.stopPropagation();

        if (wishlistBusyId) {
            return;
        }

        if (!user) {
            requireSignIn("Login to save gems to your wishlist.");
            return;
        }

        const isWishlisted = wishlistIds.has(gem.id);

        setWishlistBusyId(gem.id);

        try {
            if (isWishlisted) {
                await removeFromWishlist(gem.id);

                setWishlistIds((prev) => {
                    const next = new Set(prev);
                    next.delete(gem.id);
                    return next;
                });
            } else {
                await addToWishlist(gem.id);

                setWishlistIds((prev) => {
                    const next = new Set(prev);
                    next.add(gem.id);
                    return next;
                });
            }
        } catch (error) {
            console.error("Error updating wishlist:", error);
        } finally {
            setWishlistBusyId(null);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();

        setCurrentPage(1);

        if (search) {
            navigate(
                `/hidden-gems?search=${encodeURIComponent(search)}`,
                { replace: true }
            );
        } else {
            navigate("/hidden-gems", { replace: true });
        }
    };

    const handleClearSearch = () => {
        setSearch("");
        setCurrentPage(1);

        setFilter({
            status: "",
            category: "",
            state: "",
            sort: "latest",
        });

        navigate("/hidden-gems", { replace: true });
    };

    const handleFilterChange = (key, value) => {
        setCurrentPage(1);

        setFilter((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const clearAllFilters = () => {
        setSearch("");
        setCurrentPage(1);

        setFilter({
            status: "",
            category: "",
            state: "",
            sort: "latest",
        });

        navigate("/hidden-gems", { replace: true });
    };

    const handlePageChange = (page) => {
        if (page < 1 || page > lastPage || page === currentPage) {
            return;
        }

        setCurrentPage(page);

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const renderPageNumbers = () => {
        const pages = [];

        for (let page = 1; page <= lastPage; page += 1) {
            pages.push(
                <button
                    type="button"
                    key={page}
                    className={`hidden-gems-pagination-number ${
                        currentPage === page
                            ? "hidden-gems-pagination-active"
                            : ""
                    }`}
                    onClick={() => handlePageChange(page)}
                >
                    {page}
                </button>
            );
        }

        return pages;
    };

    const hasActiveFilters =
        Boolean(search) ||
        Boolean(filter.status) ||
        Boolean(filter.category) ||
        Boolean(filter.state) ||
        filter.sort !== "latest";

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <h1>Hidden Gems Discovery</h1>

                <button
                    className="hidden-gems-submit-btn"
                    onClick={() => {
                        if (!user) {
                            requireSignIn(
                                "Login to submit a hidden gem."
                            );
                            return;
                        }

                        navigate("/hidden-gems/create");
                    }}
                >
                    + Hidden Gem
                </button>
            </div>

            <div className="hidden-gems-search">
                <form
                    className="hidden-gems-search-form"
                    onSubmit={handleSearchSubmit}
                >
                    <div className="hidden-gems-search-wrapper">
                        <input
                            type="text"
                            placeholder="Search by place name, location, or state..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="hidden-gems-search-input"
                        />

                        <div className="hidden-gems-search-actions">
                            {search && (
                                <button
                                    type="button"
                                    className="hidden-gems-search-clear"
                                    onClick={handleClearSearch}
                                    aria-label="Clear search"
                                >
                                    ✕
                                </button>
                            )}

                            <button
                                type="submit"
                                className="hidden-gems-search-btn"
                            >
                                Search
                            </button>
                        </div>
                    </div>
                </form>

                {lastSearch && !loading && (
                    <p className="hidden-gems-search-result-count">
                        Found <strong>{totalResults}</strong>{" "}
                        result{totalResults !== 1 ? "s" : ""} for "
                        <strong>{lastSearch}</strong>"
                    </p>
                )}
            </div>

            <div className="hidden-gems-filters">
                <select
                    className="hidden-gems-filter-select"
                    value={filter.status}
                    onChange={(e) =>
                        handleFilterChange("status", e.target.value)
                    }
                >
                    <option value="">All Status</option>
                    <option value="verified">Verified</option>
                    <option value="pending">Pending</option>
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.category}
                    onChange={(e) =>
                        handleFilterChange("category", e.target.value)
                    }
                >
                    <option value="">All Categories</option>

                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.state}
                    onChange={(e) =>
                        handleFilterChange("state", e.target.value)
                    }
                >
                    <option value="">All States</option>

                    {states.map((state) => (
                        <option key={state} value={state}>
                            {state}
                        </option>
                    ))}
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.sort}
                    onChange={(e) =>
                        handleFilterChange("sort", e.target.value)
                    }
                >
                    <option value="latest">Latest First</option>
                    <option value="oldest">Oldest First</option>
                </select>

                {hasActiveFilters && (
                    <button
                        type="button"
                        className="hidden-gems-filter-clear hidden-gems-filter-clear-active"
                        onClick={clearAllFilters}
                    >
                        <span>✕</span> Clear All
                    </button>
                )}
            </div>

            {loading ? (
                <LoadingCards count={9} />
            ) : gems.length === 0 ? (
                <div className="hidden-gems-empty">
                    <p>No hidden gems found.</p>
                </div>
            ) : (
                <>
                    <div className="hidden-gems-list">
                        {gems.map((gem) => (
                            <div
                                className="hidden-gems-card"
                                key={gem.id}
                                onClick={() =>
                                    navigate(
                                        `/hidden-gems/${gem.id}?${location.search.substring(
                                            1
                                        )}`
                                    )
                                }
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
                                    <div className="wishlist-card-title-row">
                                        <h2>{gem.place_name}</h2>

                                        <div className="hidden-gems-card-icon-actions">
                                            <button
                                                type="button"
                                                className="wishlist-remove-btn"
                                                disabled={
                                                    wishlistBusyId === gem.id
                                                }
                                                title={
                                                    wishlistIds.has(gem.id)
                                                        ? "Remove from wishlist"
                                                        : "Save to wishlist"
                                                }
                                                onClick={(e) =>
                                                    handleToggleWishlist(
                                                        e,
                                                        gem
                                                    )
                                                }
                                            >
                                                {wishlistIds.has(gem.id)
                                                    ? "♥"
                                                    : "♡"}
                                            </button>

                                            <ReportButton
                                                gem={gem}
                                                user={user}
                                            />
                                        </div>
                                    </div>

                                    <div className="hidden-gems-card-tags">
                                        <span className="hidden-gems-card-category">
                                            {gem.category?.name ||
                                                "Uncategorized"}
                                        </span>

                                        <span className="hidden-gems-card-state">
                                            {gem.state || "Unknown"}
                                        </span>
                                    </div>

                                    <p className="hidden-gems-card-description">
                                        <TruncatedText
                                            text={
                                                gem.description ||
                                                "No description"
                                            }
                                            limit={100}
                                        />
                                    </p>

                                    <div className="hidden-gems-card-status">
                                        {gem.status === "hidden_gem" ? (
                                            <span className="hidden-gems-card-verified">
                                                Verified
                                            </span>
                                        ) : gem.status ===
                                          "pending_community_vote" ? (
                                            <span className="hidden-gems-card-pending">
                                                Pending (
                                                {gem.votes_count ?? 0}/
                                                {gem.verification_threshold ||
                                                    10}{" "}
                                                votes)
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {lastPage > 1 && (
                        <div className="hidden-gems-pagination">
                            <button
                                type="button"
                                className="hidden-gems-pagination-btn"
                                disabled={currentPage === 1}
                                onClick={() =>
                                    handlePageChange(currentPage - 1)
                                }
                            >
                                Previous
                            </button>

                            <div className="hidden-gems-pagination-numbers">
                                {renderPageNumbers()}
                            </div>

                            <button
                                type="button"
                                className="hidden-gems-pagination-btn"
                                disabled={currentPage === lastPage}
                                onClick={() =>
                                    handlePageChange(currentPage + 1)
                                }
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}

            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={signInMessage}
            />
        </div>
    );
}