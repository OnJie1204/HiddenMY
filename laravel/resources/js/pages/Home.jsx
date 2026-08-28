import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getTripItineraries } from '../api/tripItinerary';
import { getHiddenGems } from '../api/hiddenGems';
import { getWishlist, addToWishlist, removeFromWishlist } from '../api/wishlist';
import HiddenGemMarker from '../components/HiddenGemMarker';
import ReportButton from '../components/ReportButton';
import SignInPrompt from '../components/SignInPrompt';
import { cartoTileUrl } from '../utils/cartoTiles';

// Fix leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function Home({ user }) {
    const navigate = useNavigate();
    const [recentTrips, setRecentTrips] = useState([]);
    const [popularGems, setPopularGems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [mapGems, setMapGems] = useState([]);
    const [selectedGem, setSelectedGem] = useState(null);
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistBusyId, setWishlistBusyId] = useState(null);
    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");
    const mapRef = useRef(null);

    const requireSignIn = (message) => {
        setSignInMessage(message);
        setShowSignIn(true);
    };

    const handleProtectedNavigation = (event, message) => {
        if (user) return;
        event.preventDefault();
        requireSignIn(message);
    };

    useEffect(() => {
        if (!user) return;
        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(g => g.id))))
            .catch(err => console.error('Error fetching wishlist:', err));
    }, [user]);

    const handleToggleWishlist = async (e, gem) => {
        e.stopPropagation();
        if (wishlistBusyId) return;
        if (!user) {
            requireSignIn("Login to save gems to your wishlist.");
            return;
        }

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

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Trip itineraries are account-specific (and 401 for a guest) —
                // fetched separately so a guest still gets the popular-gems
                // section below instead of the whole page silently going empty
                // because Promise.all rejected on the one call that needed login.
                const [tripsRes, gemsRes] = await Promise.all([
                    user ? getTripItineraries().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                    getHiddenGems({ limit: 20 })
                ]);

                let allGems = gemsRes.data.data || [];

                allGems = allGems.sort((a, b) => {
                    if (a.status === 'hidden_gem' && b.status !== 'hidden_gem') return -1;
                    if (b.status === 'hidden_gem' && a.status !== 'hidden_gem') return 1;

                    if (a.vote_count !== b.vote_count) {
                        return (b.vote_count || 0) - (a.vote_count || 0);
                    }

                    const aHasImage = a.images && a.images.length > 0;
                    const bHasImage = b.images && b.images.length > 0;
                    if (aHasImage && !bHasImage) return -1;
                    if (bHasImage && !aHasImage) return 1;

                    return 0;
                });

                const topGems = allGems.slice(0, 3);
                setPopularGems(allGems.slice(0, 10));
                setRecentTrips(tripsRes.data || []);
                setMapGems(allGems.slice(0, 6));
                setSelectedGem(topGems[0] || null);
            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Fly to gem when selectedGem changes
    useEffect(() => {
        if (selectedGem && mapRef.current) {
            mapRef.current.flyTo(
                [selectedGem.latitude, selectedGem.longitude],
                13,
                { duration: 1.0 }
            );
        }
    }, [selectedGem]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/hidden-gems?search=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const quickActions = [
        { to: '/map', label: 'Map' },
        { to: '/hidden-gems', label: 'Gems' },
        { to: '/wishlist', label: 'Wishlist', signInMessage: 'Login to view your wishlist.' },
        { to: '/trip-itinerary', label: 'Trips', signInMessage: 'Login to view and plan your trips.' },
        { to: '/profile', label: 'Profile', signInMessage: 'Login to view your profile.' },
    ];

    const greetings = ['Hey', 'Hi', 'Hello', 'Welcome back'];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const topGems = mapGems.slice(0, 3);

    const handleMapClick = () => {
        if (selectedGem) {
            navigate('/map', {
                state: {
                    highlightGem: selectedGem,
                    highlightId: selectedGem.id
                }
            });
        } else {
            navigate('/map');
        }
    };

    const handleGemSelect = (gem) => {
        setSelectedGem(gem);
    };

    const defaultCenter = [4.2105, 101.9758];
    const mapCenter = selectedGem 
        ? [selectedGem.latitude, selectedGem.longitude] 
        : defaultCenter;

    // Format gem for HiddenGemMarker
    const formatGemForMarker = (gem) => {
        return {
            id: gem.id,
            source: 'database',
            title: gem.place_name,
            state: gem.state,
            address: gem.address,
            description: gem.description,
            latitude: gem.latitude,
            longitude: gem.longitude,
            image: gem.images?.[0]?.image_url || null,
            voteCount: gem.vote_count,
            verificationThreshold: gem.verification_threshold,
            category: gem.category?.name,
            status: gem.status,
        };
    };

    const heroImageUrl = topGems[0]?.images?.[0]?.image_url || null;

    return (
        <div className="home-page">

            <div className="home-hero-fun">
                <div className="home-hero-fun-content">
                    <h1>
                        {randomGreeting} <span>{user?.name || 'Explorer'}</span>!
                    </h1>
                    <p>Let's find your next adventure!</p>
                    <div className="home-search-fun">
                        <form onSubmit={handleSearch}>
                            <input
                                type="text"
                                placeholder="Search hidden gems, locations, or states..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </form>
                    </div>
                </div>
                {loading ? (
                    <div className="home-hero-fun-image home-hero-fun-image-loading" aria-hidden="true">
                        <div className="home-hero-fun-image-loading-bar">
                            <div className="home-hero-fun-image-loading-bar-indicator" />
                        </div>
                    </div>
                ) : heroImageUrl && (
                    <button
                        type="button"
                        className="home-hero-fun-image"
                        onClick={() => navigate(`/hidden-gems/${topGems[0].id}`)}
                        aria-label={`View ${topGems[0].place_name}`}
                    >
                        <img src={heroImageUrl} alt={topGems[0].place_name} />
                        <span className="home-hero-fun-image-caption">
                            {topGems[0].place_name}
                        </span>
                    </button>
                )}
            </div>

            <div className="home-quick-fun">
                {quickActions.map(({ to, label, signInMessage: actionSignInMessage }) => (
                    <Link
                        key={to}
                        to={to}
                        className="home-quick-fun-item"
                        onClick={(event) => actionSignInMessage && handleProtectedNavigation(event, actionSignInMessage)}
                    >
                        <span className="home-quick-fun-label">{label}</span>
                    </Link>
                ))}
            </div>

            <div className="home-map-flight">
                <div className="home-map-flight-header">
                    <span className="home-map-flight-title">Hidden Gems Map Preview</span>
                    <Link to="/map" className="home-map-flight-link">View Full Map →</Link>
                </div>

                <div className="home-map-flight-body">
                    <div className="home-map-flight-list">
                        <div className="home-map-flight-list-header">Top Hidden Gems</div>
                        {loading ? (
                            <p className="home-map-flight-loading">Loading gems...</p>
                        ) : topGems.length === 0 ? (
                            <div className="home-map-flight-empty">
                                <p>No hidden gems yet.</p>
                            </div>
                        ) : (
                            topGems.map((gem, index) => (
                                <div
                                    key={gem.id}
                                    className={`home-map-flight-item ${selectedGem?.id === gem.id ? 'active' : ''}`}
                                    onClick={() => handleGemSelect(gem)}
                                >
                                    <span className="home-map-flight-rank">{index + 1}.</span>
                                    <div className="home-map-flight-item-content">
                                        <div className="home-map-flight-item-top">
                                            <span className="home-map-flight-item-name">{gem.place_name}</span>
                                            {gem.status === 'hidden_gem' ? (
                                                <span className="home-map-flight-item-status verified">Hidden Gem</span>
                                            ) : (
                                                <span className="home-map-flight-item-status pending">Awaiting Votes</span>
                                            )}
                                        </div>
                                        <span className="home-map-flight-item-category">{gem.category?.name || 'Uncategorized'}</span>
                                        <span className="home-map-flight-item-state">{gem.state || 'Unknown'}</span>
                                    </div>
                                </div>
                            ))
                        )}
                        <div className="home-map-flight-stats">
                            <span>{mapGems.length} gems</span>
                            <span>{new Set(mapGems.map(g => g.state)).size} states</span>
                        </div>
                    </div>

                    <div className="home-map-flight-map" onClick={handleMapClick}>
                        <MapContainer
                            ref={mapRef}
                            center={mapCenter}
                            zoom={selectedGem ? 13 : 7}
                            zoomControl={false}
                            style={{ width: '100%', height: '100%', minHeight: '280px', borderRadius: '12px' }}
                            scrollWheelZoom={true}
                            dragging={false}
                            touchZoom={false}
                            doubleClickZoom={false}
                        >
                            <TileLayer
                                url={cartoTileUrl("rastertiles/voyager")}
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />
                            <ZoomControl position="bottomright" />
                            {selectedGem && (
                                <HiddenGemMarker
                                    gem={formatGemForMarker(selectedGem)}
                                    onClick={() => {}}
                                />
                            )}
                            {topGems.map((gem) => (
                                <HiddenGemMarker
                                    key={`marker-${gem.id}`}
                                    gem={formatGemForMarker(gem)}
                                    onClick={() => handleGemSelect(gem)}
                                />
                            ))}
                        </MapContainer>
                    </div>
                </div>
            </div>

            <div className="home-trending">
                <div className="home-trending-header">
                    <h2>Trending Now</h2>
                    <Link to="/hidden-gems" className="home-trending-seeall">See All →</Link>
                </div>
                <div className="home-trending-scroll">
                    {loading ? (
                        <p className="home-loading">Loading gems...</p>
                    ) : popularGems.length === 0 ? (
                        <div className="home-empty-trending">
                            <p>No hidden gems yet. Be the first to share one!</p>
                        </div>
                    ) : (
                        popularGems.map((gem) => (
                            <div
                                key={gem.id}
                                className="home-trending-card"
                                onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                            >
                                <div className="home-trending-card-image">
                                    {gem.images && gem.images.length > 0 ? (
                                        <img
                                            src={gem.images[0].image_url}
                                            alt={gem.place_name}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.parentElement.innerHTML = `<div class="home-trending-card-placeholder">No Image</div>`;
                                            }}
                                        />
                                    ) : (
                                        <div className="home-trending-card-placeholder">No Image</div>
                                    )}
                                </div>
                                <div className="home-trending-card-body">
                                    <div className="home-trending-card-header-row">
                                        <h4>{gem.place_name}</h4>
                                        <div className="hidden-gems-card-icon-actions">
                                            <button
                                                type="button"
                                                className="wishlist-remove-btn"
                                                disabled={wishlistBusyId === gem.id}
                                                title={wishlistIds.has(gem.id) ? "Remove from wishlist" : "Save to wishlist"}
                                                onClick={(e) => handleToggleWishlist(e, gem)}
                                            >
                                                {wishlistIds.has(gem.id) ? "♥" : "♡"}
                                            </button>
                                            <ReportButton gem={gem} user={user} />
                                        </div>
                                        {gem.status === 'hidden_gem' ? (
                                            <span className="home-trending-card-status verified">✦ Hidden Gem</span>
                                        ) : (
                                            <span className="home-trending-card-status pending">Awaiting Votes</span>
                                        )}
                                    </div>
                                    <div className="home-trending-card-tags">
                                        <span className="home-trending-card-category">
                                            {gem.category?.name || 'Uncategorized'}
                                        </span>
                                        <span className="home-trending-card-state">
                                            {gem.state || 'Unknown'}
                                        </span>
                                    </div>
                                    <span className="home-trending-card-rating">{gem.vote_count || 0} votes</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="home-adventures">
                <div className="home-adventures-header">
                    <h2>Your Adventures</h2>
                    <Link
                        to="/trip-itinerary"
                        className="home-adventures-seeall"
                        onClick={(event) => handleProtectedNavigation(event, 'Login to view your trips.')}
                    >
                        See All →
                    </Link>
                </div>
                <div className="home-adventures-grid">
                    {loading ? (
                        <p className="home-loading">Loading trips...</p>
                    ) : recentTrips.length === 0 ? (
                        <div className="home-empty-adventures">
                            <p>No adventures yet</p>
                            <Link
                                to="/trip-itinerary"
                                onClick={(event) => handleProtectedNavigation(event, 'Login to start planning a trip.')}
                            >
                                Start planning →
                            </Link>
                        </div>
                    ) : (
                        recentTrips.slice(0, 2).map((trip) => (
                            <Link
                                key={trip.id}
                                to={`/trip-itinerary/${trip.id}`}
                                className="home-adventure-card"
                            >
                                <div className="home-adventure-card-content">
                                    <h4>{trip.trip_name}</h4>
                                    <p>
                                        {trip.locations_count ?? trip.locations?.length ?? 0} stops · {new Date(trip.created_at).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short'
                                        })}
                                    </p>
                                </div>
                                <div className="home-adventure-card-bottom">
                                    <span className="home-adventure-card-arrow">View Trip →</span>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>

            <div className="home-plan-explore">
                <div className="home-plan-explore-header">
                    <h2>Plan Your Adventure</h2>
                </div>
                <div className="home-plan-explore-grid">
                    <Link
                        to="/trip-itinerary"
                        className="home-plan-card home-plan-card-trip"
                        onClick={(event) => handleProtectedNavigation(event, 'Login to create a trip itinerary.')}
                    >
                        <div className="home-plan-card-content">
                            <h3>Create New Trip</h3>
                            <p>Plan your next adventure from scratch</p>
                        </div>
                        <div className="home-plan-card-bottom">
                            <span className="home-plan-card-arrow">Start →</span>
                        </div>
                    </Link>
                </div>
            </div>

            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={signInMessage}
            />
        </div>
    );
}

export default Home;
