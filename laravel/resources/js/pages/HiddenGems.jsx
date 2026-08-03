import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHiddenGems, getCategories, getStates } from "../api/hiddenGems";

import "../styles/global.css";

export default function HiddenGems() {
    const navigate = useNavigate();
    const [gems, setGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState({ status: "", category: "", state: "" });
    const [categories, setCategories] = useState([]);
    const [states, setStates] = useState([]);

    const fetchGems = async () => {
        setLoading(true);
        try {
            const params = {};
            if (search) params.search = search;
            if (filter.status) params.status = filter.status;
            if (filter.category) params.category = filter.category;
            if (filter.state) params.state = filter.state;

            const response = await getHiddenGems(params);
            console.log('API Response:', response.data);  // 加这行查看数据
            setGems(response.data.data || []);
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

    useEffect(() => {
        fetchGems();
        fetchFilters();
    }, [search, filter]);

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <h1>🔍 Hidden Gems Discovery</h1>

                <button
                    className="hidden-gems-submit-btn"
                    onClick={() => navigate("/hidden-gems/create")}
                >
                    + Hidden Gem
                </button>

            </div>

            <div className="hidden-gems-search">
                <input
                    type="text"
                    placeholder="Search hidden gems..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="hidden-gems-search-input"
                />
            </div>

            <div className="hidden-gems-filters">
                <select
                    className="hidden-gems-filter-select"
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                >
                    <option value="">All Status</option>
                    <option value="verified">Verified</option>
                    <option value="pending">Pending</option>
                </select>

                <select
                    className="hidden-gems-filter-select"
                    value={filter.category}
                    onChange={(e) => setFilter({ ...filter, category: e.target.value })}
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
                    onChange={(e) => setFilter({ ...filter, state: e.target.value })}
                >
                    <option value="">All States</option>
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
                                        src={`http://localhost:8000/storage/${gem.images[0].image_url}`}
                                        alt={gem.place_name}
                                    />
                                ) : (
                                    <div className="hidden-gems-card-no-image">
                                        No Image
                                    </div>
                                )}
                            </div>

                            <div className="hidden-gems-card-content">
                                <h2>{gem.place_name}</h2>

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
                                    {gem.status === 'verified' ? (
                                        <span className="hidden-gems-card-verified">
                                            Verified
                                        </span>
                                    ) : (
                                        <span className="hidden-gems-card-pending">
                                            Pending ({gem.vote_count || 0}/{gem.verification_threshold || 10} votes)
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