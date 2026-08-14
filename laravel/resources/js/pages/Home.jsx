import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTripItineraries } from '../api/tripItinerary';
import { getHiddenGems } from '../api/hiddenGems';

function Home({ user }) {
    const navigate = useNavigate();
    const [recentTrips, setRecentTrips] = useState([]);
    const [popularGems, setPopularGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [tripsRes, gemsRes] = await Promise.all([
                    getTripItineraries(),
                    getHiddenGems({ status: 'verified', limit: 6 })
                ]);
                setRecentTrips(tripsRes.data || []);
                setPopularGems(gemsRes.data.data || []);
            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/hidden-gems?search=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const quickActions = [
        { to: '/map', icon: '🗺️', label: 'Map', color: '#e6f6f3' },
        { to: '/hidden-gems', icon: '💎', label: 'Gems', color: '#ffe4e8' },
        { to: '/trip-itinerary', icon: '✈️', label: 'Trips', color: '#e0f2fe' },
        { to: '/profile', icon: '👤', label: 'Profile', color: '#ede9fe' },
    ];

    const greetings = ['Hey', 'Hi', 'Hello', '👋', '☀️', '🌟', '🎉', '✨'];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    return (
        <div className="home-page">

            {/* Hero / Greeting */}
            <div className="home-hero-fun">
                <div className="home-hero-fun-content">
                    <h1>
                        {randomGreeting} <span>{user?.name || 'Explorer'}</span>! 🌏
                    </h1>
                    <p>Let's find your next adventure!</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="home-search-fun">
                <form onSubmit={handleSearch}>
                    <span className="home-search-fun-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search hidden gems, locations, or states..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </form>
            </div>

            {/* Quick Actions */}
            <div className="home-quick-fun">
                {quickActions.map(({ to, icon, label, color }) => (
                    <Link key={to} to={to} className="home-quick-fun-item" style={{ background: color }}>
                        <span className="home-quick-fun-icon">{icon}</span>
                        <span className="home-quick-fun-label">{label}</span>
                    </Link>
                ))}
            </div>

            {/* Trending Now */}
            <div className="home-trending">
                <div className="home-trending-header">
                    <h2>🔥 Trending Now</h2>
                    <Link to="/hidden-gems" className="home-trending-seeall">See All →</Link>
                </div>
                <div className="home-trending-list">
                    {loading ? (
                        <p className="home-loading">Loading gems...</p>
                    ) : popularGems.length === 0 ? (
                        <div className="home-empty-trending">
                            <p>No hidden gems yet. Be the first to share one! 🚀</p>
                        </div>
                    ) : (
                        popularGems.slice(0, 4).map((gem) => (
                            <div
                                key={gem.id}
                                className="home-trending-item"
                                onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                            >
                                <div className="home-trending-item-left">
                                    <span className="home-trending-item-emoji">
                                        {gem.category?.name === 'Nature' ? '🌿' :
                                         gem.category?.name === 'Culture & Arts' ? '🎨' :
                                         gem.category?.name === 'Beach & Nature' ? '🌊' :
                                         gem.category?.name === 'Food' ? '🍽️' :
                                         gem.category?.name === 'Spiritual Site' ? '🏯' :
                                         '📍'}
                                    </span>
                                    <div className="home-trending-item-info">
                                        <h4>{gem.place_name}</h4>
                                        <p>{gem.state || 'Unknown'} · {gem.category?.name || 'Uncategorized'}</p>
                                    </div>
                                </div>
                                <div className="home-trending-item-right">
                                    <span className="home-trending-item-rating">⭐ {gem.vote_count || 0}</span>
                                    <span className="home-trending-item-badge">✅</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Your Adventures */}
            <div className="home-adventures">
                <div className="home-adventures-header">
                    <h2>🗺️ Your Adventures</h2>
                    <Link to="/trip-itinerary" className="home-adventures-seeall">See All →</Link>
                </div>
                <div className="home-adventures-grid">
                    {loading ? (
                        <p className="home-loading">Loading trips...</p>
                    ) : recentTrips.length === 0 ? (
                        <div className="home-empty-adventures">
                            <span>✈️</span>
                            <p>No adventures yet</p>
                            <Link to="/trip-itinerary">Start planning →</Link>
                        </div>
                    ) : (
                        recentTrips.slice(0, 2).map((trip) => (
                            <Link
                                key={trip.id}
                                to={`/trip-itinerary/${trip.id}`}
                                className="home-adventure-card"
                            >
                                <div className="home-adventure-card-icon">✈️</div>
                                <div className="home-adventure-card-content">
                                    <h4>{trip.trip_name}</h4>
                                    <p>
                                        📍 {trip.locations?.length || 0} stops · 
                                        🕐 {new Date(trip.created_at).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short'
                                        })}
                                    </p>
                                </div>
                                <span className="home-adventure-card-arrow">→</span>
                            </Link>
                        ))
                    )}
                </div>
            </div>

            {/* ===== Plan & Explore (Map + Create Trip) ===== */}
            <div className="home-plan-explore">
                <div className="home-plan-explore-header">
                    <h2>✨ Plan & Explore</h2>
                </div>
                <div className="home-plan-explore-grid">
                    {/* Map Card */}
                    <Link to="/map" className="home-plan-card home-plan-card-map">
                        <div className="home-plan-card-icon">🗺️</div>
                        <h3>Explore Map</h3>
                        <p>Find hidden gems on the interactive map</p>
                        <span className="home-plan-card-arrow">Explore →</span>
                    </Link>

                    {/* Create Trip Card */}
                    <Link to="/trip-itinerary" className="home-plan-card home-plan-card-trip">
                        <div className="home-plan-card-icon">🚀</div>
                        <h3>Create New Trip</h3>
                        <p>Plan your next adventure from scratch</p>
                        <span className="home-plan-card-arrow">Start →</span>
                    </Link>
                </div>
            </div>

        </div>
    );
}

export default Home;