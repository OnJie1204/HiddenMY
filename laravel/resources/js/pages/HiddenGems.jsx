import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getHiddenGems, getCategories, getStates } from "../api/hiddenGems";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";

import "../styles/global.css";

export default function HiddenGems() {
    const navigate = useNavigate();
    const location = useLocation();

    // Get search from URL params
    const queryParams = new URLSearchParams(location.search);
    const initialSearch = queryParams.get('search') || '';

    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(initialSearch);
    const [filter, setFilter] = useState({ status: "", category: "", state: "" });
    const [categories, setCategories] = useState([]);
    const [states, setStates] = useState([]);
    const [totalResults, setTotalResults] = useState(0);
    const [lastSearch, setLastSearch] = useState('');
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistBusyId, setWishlistBusyId] = useState(null);

    const fetchGems = async () => {
        setLoading(true);
        try {
            const params = {};
            if (search) params.search = search;
            if (filter.status) params.status = filter.status;
            if (filter.category) params.category = filter.category;
            if (filter.state) params.state = filter.state;

            const response = await getHiddenGems(params);
            console.log('API Response:', response.data);
            setGems(response.data.data || []);
            setTotalResults(response.data.total || 0);
            setLastSearch(search);
        } catch (error) {
            console.error('Error fetching gems:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFilters = async () => {
        try {
            const [catRes, stateRes] = await Promise.all([
                getCategories(),
                getStates()
            ]);
            setCategories(catRes.data.data || []);
            setStates(stateRes.data.data || []);
        } catch (error) {
            console.error('Error fetching filters:', error);
        }
    };

    // Handle search from URL on page load
    useEffect(() => {
        if (initialSearch) {
            setSearch(initialSearch);
        }
    }, [initialSearch]);

    useEffect(() => {
        fetchGems();
        fetchFilters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, filter]);

    useEffect(() => {
        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(g => g.id))))
            .catch(err => console.error('Error fetching wishlist:', err));
    }, []);

    const handleToggleWishlist = async (e, gem) => {
        e.stopPropagation();
        if (wishlistBusyId) return;

        const isWishlisted = wishlistIds.has(gem.id);
        setWishlistBusyId(gem.id);
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
        } catch (error) {
            console.error('Error updating wishlist:', error);
        } finally {
            setWishlistBusyId(null);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (search) {
            navigate(`/hidden-gems?search=${encodeURIComponent(search)}`);
        } else {
            navigate('/hidden-gems');
        }
        fetchGems();
    };

    const handleClearSearch = () => {
        setSearch('');
        navigate('/hidden-gems');
    };

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <h1>Hidden Gems Discovery</h1>

                <button
                    className="hidden-gems-submit-btn"
                    onClick={() => navigate("/hidden-gems/create")}
                >
                    + Hidden Gem
                </button>
            </div>

            {/* Search Bar */}
            <div className="hidden-gems-search">
                <form className="hidden-gems-search-form" onSubmit={handleSearchSubmit}>
                    <div className="hidden-gems-search-wrapper">
                        <input
                            type="text"
                            placeholder="Search hidden gems by place name or keyword..."
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
                            <button type="submit" className="hidden-gems-search-btn">
                                Search
                            </button>
                        </div>
                    </div>
                </form>

                {/* Search result count */}
                {lastSearch && !loading && (
                    <p className="hidden-gems-search-result-count">
                        Found <strong>{totalResults}</strong> result{totalResults !== 1 ? 's' : ''} for "<strong>{lastSearch}</strong>"
                    </p>
                )}
            </div>

            {/* Filters */}
            <div className="hidden-gems-filters">
                <select
                    className="hidden-gems-filter-select"
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                >
                    <option value="">Select Status</option>
                    <option value="hidden_gem">Hidden Gem</option>
                    <option value="pending_community_vote">Awaiting Votes</option>
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.category}
                    onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.state}
                    onChange={(e) => setFilter({ ...filter, state: e.target.value })}
                >
                    <option value="">Select State</option>
                    {states.map((state) => (
                        <option key={state} value={state}>
                            {state}
                        </option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="hidden-gems-loading">
                    <p>Loading hidden gems...</p>
                </div>
            ) : gems.length === 0 ? (
                <div className="hidden-gems-empty">
                    <p>No hidden gems found.</p>
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
                                {gem.images && gem.images.length > 0 ? (
                                    <img
                                        src={gem.images[0].image_url}
                                        alt={gem.place_name}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.parentElement.innerHTML = `<div class="hidden-gems-card-no-image">No Image</div>`;
                                        }}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div className="hidden-gems-card-no-image">
                                        No Image
                                    </div>
                                )}
                            </div>

                            <div className="hidden-gems-card-content">
                                <div className="wishlist-card-title-row">
                                    <h2>{gem.place_name}</h2>
                                    <button
                                        type="button"
                                        className="wishlist-remove-btn"
                                        disabled={wishlistBusyId === gem.id}
                                        title={wishlistIds.has(gem.id) ? "Remove from wishlist" : "Save to wishlist"}
                                        onClick={(e) => handleToggleWishlist(e, gem)}
                                    >
                                        {wishlistIds.has(gem.id) ? "♥" : "♡"}
                                    </button>
                                </div>

                                <div className="hidden-gems-card-tags">
                                    <span className="hidden-gems-card-category">
                                        {gem.category?.name || 'Uncategorized'}
                                    </span>
                                    <span className="hidden-gems-card-state">
                                        {gem.state || 'Unknown'}
                                    </span>
                                </div>

                                <p className="hidden-gems-card-description">
                                    {gem.description || 'No description'}
                                </p>

                                <div className="hidden-gems-card-status">
                                    {gem.status === 'hidden_gem' ? (
                                        <span className="hidden-gems-card-verified">
                                            Hidden Gem
                                        </span>
                                    ) : (
                                        <span className="hidden-gems-card-voting">
                                            {gem.vote_count || 0}/{gem.verification_threshold || 10} votes
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}