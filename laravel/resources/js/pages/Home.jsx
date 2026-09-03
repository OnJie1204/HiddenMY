import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getTripItineraries } from '../api/tripItinerary';
import { getHiddenGems } from '../api/hiddenGems';
import { getWishlist, addToWishlist, removeFromWishlist } from '../api/wishlist';
import HiddenGemMarker from '../components/HiddenGemMarker';
import PhotoCarousel from '../components/PhotoCarousel';
import Spinner from '../components/Spinner';
import ReportButton from '../components/ReportButton';
import SignInPrompt from '../components/SignInPrompt';
import { cartoTileUrl } from '../utils/cartoTiles';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const tripColors = [
    '#8DB99C',
    '#C58C7A',
    '#A99B72',
    '#9B8798',
    '#6FA39A',
];

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
    const [signInMessage, setSignInMessage] = useState('');

    const mapRef = useRef(null);
    const trendingRef = useRef(null);

    const requireSignIn = (message) => {
        setSignInMessage(message);
        setShowSignIn(true);
    };

    const handleProtectedNavigation = (event, message) => {
        if (user) {
            return;
        }

        event.preventDefault();
        requireSignIn(message);
    };

    useEffect(() => {
        if (!user) {
            setWishlistIds(new Set());
            return;
        }

        getWishlist()
            .then((res) => {
                setWishlistIds(
                    new Set((res.data.data || []).map((gem) => gem.id))
                );
            })
            .catch((error) => {
                console.error('Error fetching wishlist:', error);
            });
    }, [user]);

    const handleToggleWishlist = async (event, gem) => {
        event.stopPropagation();

        if (wishlistBusyId) {
            return;
        }

        if (!user) {
            requireSignIn('Login to save gems to your wishlist.');
            return;
        }

        const isWishlisted = wishlistIds.has(gem.id);
        setWishlistBusyId(gem.id);

        try {
            if (isWishlisted) {
                await removeFromWishlist(gem.id);

                setWishlistIds((previous) => {
                    const next = new Set(previous);
                    next.delete(gem.id);
                    return next;
                });
            } else {
                await addToWishlist(gem.id);

                setWishlistIds((previous) => {
                    const next = new Set(previous);
                    next.add(gem.id);
                    return next;
                });
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
                const [tripsRes, gemsRes] = await Promise.all([
                    user
                        ? getTripItineraries().catch(() => ({ data: [] }))
                        : Promise.resolve({ data: [] }),
                    getHiddenGems({
                        per_page: 20,
                        sort: 'latest',
                    }),
                ]);

                let allGems = gemsRes.data.data || [];

                allGems = [...allGems].sort((a, b) => {
                    if (
                        a.status === 'hidden_gem' &&
                        b.status !== 'hidden_gem'
                    ) {
                        return -1;
                    }

                    if (
                        b.status === 'hidden_gem' &&
                        a.status !== 'hidden_gem'
                    ) {
                        return 1;
                    }

                    const aVotes = a.votes_count ?? a.vote_count ?? 0;
                    const bVotes = b.votes_count ?? b.vote_count ?? 0;

                    if (aVotes !== bVotes) {
                        return bVotes - aVotes;
                    }

                    const aHasImage =
                        Array.isArray(a.images) && a.images.length > 0;
                    const bHasImage =
                        Array.isArray(b.images) && b.images.length > 0;

                    if (aHasImage && !bHasImage) {
                        return -1;
                    }

                    if (bHasImage && !aHasImage) {
                        return 1;
                    }

                    return 0;
                });

                const topGems = allGems.slice(0, 3);

                setPopularGems(allGems.slice(0, 10));
                setRecentTrips(tripsRes.data || []);
                setMapGems(topGems);
                setSelectedGem(topGems[0] || null);
            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    useEffect(() => {
        if (selectedGem && mapRef.current) {
            mapRef.current.flyTo(
                [
                    Number(selectedGem.latitude),
                    Number(selectedGem.longitude),
                ],
                13,
                { duration: 1.0 }
            );
        }
    }, [selectedGem]);

    const handleSearch = (event) => {
        event.preventDefault();

        const query = searchQuery.trim();

        if (!query) {
            return;
        }

        navigate(
            `/hidden-gems?search=${encodeURIComponent(query)}`
        );
    };

    const handleMapClick = () => {
        if (selectedGem) {
            navigate('/map', {
                state: {
                    highlightGem: selectedGem,
                    highlightId: selectedGem.id,
                },
            });
            return;
        }

        navigate('/map');
    };

    const handleGemSelect = (gem) => {
        setSelectedGem(gem);
    };

    const scrollTrending = (direction) => {
        if (!trendingRef.current) {
            return;
        }

        const container = trendingRef.current;
        const firstCard = container.querySelector(
            '.home-trending-card'
        );

        const cardWidth = firstCard
            ? firstCard.getBoundingClientRect().width
            : 320;

        const styles = window.getComputedStyle(container);
        const gap = parseFloat(styles.columnGap || styles.gap || '20') || 20;

        container.scrollBy({
            left: direction * (cardWidth + gap),
            behavior: 'smooth',
        });
    };

    const topGems = mapGems.slice(0, 3);

    const defaultCenter = [4.2105, 101.9758];

    const mapCenter = selectedGem
        ? [
              Number(selectedGem.latitude),
              Number(selectedGem.longitude),
          ]
        : defaultCenter;

    const formatGemForMarker = (gem) => {
        return {
            id: gem.id,
            source: 'database',
            title: gem.place_name,
            state: gem.state,
            address: gem.address,
            description: gem.description,
            latitude: Number(gem.latitude),
            longitude: Number(gem.longitude),
            image: gem.images?.[0]?.image_url || null,
            voteCount: gem.votes_count ?? gem.vote_count ?? 0,
            verificationThreshold: gem.verification_threshold,
            category: gem.category?.name,
            status: gem.status,
        };
    };

    const heroImageUrl =
        topGems[0]?.images?.[0]?.image_url || null;

    return (
        <div className="home-page">
            <div className="home-hero-fun">
                <div className="home-hero-fun-content">
                    <h1>
                        Hello <span>{user?.name || 'Explorer'}</span>!
                    </h1>

                    <p>Let's find your next adventure!</p>

                    <div className="home-search-fun">
                        <form onSubmit={handleSearch}>
                            <input
                                type="text"
                                placeholder="Search by place name, location, or state..."
                                value={searchQuery}
                                onChange={(event) =>
                                    setSearchQuery(event.target.value)
                                }
                            />
                        </form>
                    </div>
                </div>

                {loading ? (
                    <div
                        className="home-hero-fun-image home-hero-fun-image-loading"
                        aria-hidden="true"
                    >
                        <div className="home-hero-fun-image-loading-bar">
                            <div className="home-hero-fun-image-loading-bar-indicator" />
                        </div>
                    </div>
                ) : (
                    heroImageUrl && (
                        <button
                            type="button"
                            className="home-hero-fun-image"
                            onClick={() =>
                                navigate(
                                    `/hidden-gems/${topGems[0].id}`
                                )
                            }
                            aria-label={`View ${topGems[0].place_name}`}
                        >
                            <img
                                src={heroImageUrl}
                                alt={topGems[0].place_name}
                            />

                            <span className="home-hero-fun-image-caption">
                                {topGems[0].place_name}
                            </span>
                        </button>
                    )
                )}
            </div>

            <div className="home-map-flight">
                <div className="home-map-flight-header">
                    <span className="home-map-flight-title">
                        Hidden Gems Map Preview
                    </span>

                    <Link
                        to="/map"
                        className="home-map-flight-link"
                    >
                        View Full Map →
                    </Link>
                </div>

                <div className="home-map-flight-body">
                    <div className="home-map-flight-list">
                        <div className="home-map-flight-list-header">
                            Top Hidden Gems
                        </div>

                        {loading ? (
                            <Spinner
                                size="sm"
                                inline
                                label="Loading gems…"
                            />
                        ) : topGems.length === 0 ? (
                            <div className="home-map-flight-empty">
                                <p>No hidden gems yet.</p>
                            </div>
                        ) : (
                            topGems.map((gem, index) => (
                                <div
                                    key={gem.id}
                                    className={`home-map-flight-item ${
                                        selectedGem?.id === gem.id
                                            ? 'active'
                                            : ''
                                    }`}
                                    onClick={() =>
                                        handleGemSelect(gem)
                                    }
                                >
                                    <span className="home-map-flight-rank">
                                        {index + 1}.
                                    </span>

                                    <div className="home-map-flight-item-content">
                                        <div className="home-map-flight-item-top">
                                            <span className="home-map-flight-item-name">
                                                {gem.place_name}
                                            </span>

                                            {gem.status ===
                                            'hidden_gem' ? (
                                                <span className="home-map-flight-item-status verified">
                                                    Hidden Gem
                                                </span>
                                            ) : (
                                                <span className="home-map-flight-item-status pending">
                                                    Awaiting Votes
                                                </span>
                                            )}
                                        </div>

                                        <span className="home-map-flight-item-category">
                                            {gem.category?.name ||
                                                'Uncategorized'}
                                        </span>

                                        <span className="home-map-flight-item-state">
                                            {gem.state || 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}

                        <div className="home-map-flight-stats">
                            <span>
                                {topGems.length}{' '}
                                {topGems.length === 1
                                    ? 'gem'
                                    : 'gems'}
                            </span>

                            <span>
                                {
                                    new Set(
                                        topGems
                                            .map((gem) => gem.state)
                                            .filter(Boolean)
                                    ).size
                                }{' '}
                                {
                                    new Set(
                                        topGems
                                            .map((gem) => gem.state)
                                            .filter(Boolean)
                                    ).size === 1
                                        ? 'state'
                                        : 'states'
                                }
                            </span>
                        </div>
                    </div>

                    <div
                        className="home-map-flight-map"
                        onClick={handleMapClick}
                    >
                        <MapContainer
                            ref={mapRef}
                            center={mapCenter}
                            zoom={selectedGem ? 13 : 7}
                            zoomControl={false}
                            style={{
                                width: '100%',
                                height: '100%',
                                minHeight: '280px',
                                borderRadius: '12px',
                            }}
                            scrollWheelZoom
                            dragging={false}
                            touchZoom={false}
                            doubleClickZoom={false}
                        >
                            <TileLayer
                                url={cartoTileUrl(
                                    'rastertiles/voyager'
                                )}
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />

                            <ZoomControl position="bottomright" />

                            {topGems.map((gem) => (
                                <HiddenGemMarker
                                    key={`marker-${gem.id}`}
                                    gem={formatGemForMarker(gem)}
                                    onClick={() =>
                                        handleGemSelect(gem)
                                    }
                                />
                            ))}
                        </MapContainer>
                    </div>
                </div>
            </div>

            <div className="home-trending">
                <div className="home-trending-header">
                    <h2>Trending Now</h2>

                    <Link
                        to="/hidden-gems"
                        className="home-trending-seeall"
                    >
                        See All →
                    </Link>
                </div>

                <div className="home-trending-carousel">
                    {!loading && popularGems.length > 0 && (
                        <button
                            type="button"
                            className="home-trending-scroll-btn home-trending-scroll-btn-left"
                            onClick={() => scrollTrending(-1)}
                            aria-label="Scroll trending gems left"
                        >
                            ‹
                        </button>
                    )}

                    <div
                        className="home-trending-scroll"
                        ref={trendingRef}
                    >
                        {loading ? (
                            <Spinner
                                size="sm"
                                inline
                                label="Loading gems…"
                            />
                        ) : popularGems.length === 0 ? (
                            <div className="home-empty-trending">
                                <p>
                                    No hidden gems yet. Be the first to
                                    share one!
                                </p>
                            </div>
                        ) : (
                            popularGems.map((gem) => (
                                <div
                                    key={gem.id}
                                    className="home-trending-card"
                                    onClick={() =>
                                        navigate(
                                            `/hidden-gems/${gem.id}`
                                        )
                                    }
                                >
                                    <div className="home-trending-card-image">
                                        <PhotoCarousel
                                            images={gem.images || []}
                                            alt={gem.place_name}
                                            compact
                                            fill
                                            showThumbs={false}
                                        />
                                    </div>

                                    <div className="home-trending-card-body">
                                        <div className="home-trending-card-header-row">
                                            <h4>{gem.place_name}</h4>

                                            <div className="hidden-gems-card-icon-actions">
                                                <button
                                                    type="button"
                                                    className="wishlist-remove-btn"
                                                    disabled={
                                                        wishlistBusyId ===
                                                        gem.id
                                                    }
                                                    title={
                                                        wishlistIds.has(
                                                            gem.id
                                                        )
                                                            ? 'Remove from wishlist'
                                                            : 'Save to wishlist'
                                                    }
                                                    onClick={(event) =>
                                                        handleToggleWishlist(
                                                            event,
                                                            gem
                                                        )
                                                    }
                                                >
                                                    {wishlistIds.has(
                                                        gem.id
                                                    )
                                                        ? '♥'
                                                        : '♡'}
                                                </button>

                                                <ReportButton
                                                    gem={gem}
                                                    user={user}
                                                />
                                            </div>

                                            {gem.status ===
                                            'hidden_gem' ? (
                                                <span className="home-trending-card-status verified">
                                                    ✦ Hidden Gem
                                                </span>
                                            ) : (
                                                <span className="home-trending-card-status pending">
                                                    Awaiting Votes
                                                </span>
                                            )}
                                        </div>

                                        <div className="home-trending-card-tags">
                                            <span className="home-trending-card-category">
                                                {gem.category?.name ||
                                                    'Uncategorized'}
                                            </span>

                                            <span className="home-trending-card-state">
                                                {gem.state ||
                                                    'Unknown'}
                                            </span>
                                        </div>

                                        <span className="home-trending-card-rating">
                                            {gem.votes_count ??
                                                gem.vote_count ??
                                                0}{' '}
                                            votes
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {!loading && popularGems.length > 0 && (
                        <button
                            type="button"
                            className="home-trending-scroll-btn home-trending-scroll-btn-right"
                            onClick={() => scrollTrending(1)}
                            aria-label="Scroll trending gems right"
                        >
                            ›
                        </button>
                    )}
                </div>
            </div>

            <div className="home-adventures">
                <div className="home-adventures-header">
                    <h2>Your Adventures</h2>

                    <Link
                        to="/trip-itinerary"
                        className="home-adventures-seeall"
                        onClick={(event) =>
                            handleProtectedNavigation(
                                event,
                                'Login to view your trips.'
                            )
                        }
                    >
                        See All →
                    </Link>
                </div>

                <div className="home-adventures-grid">
                    {loading ? (
                        <Spinner
                            size="sm"
                            inline
                            label="Loading trips…"
                        />
                    ) : recentTrips.length === 0 ? (
                        <Link
                            to="/trip-itinerary"
                            className="home-adventure-create-card"
                            onClick={(event) =>
                                handleProtectedNavigation(
                                    event,
                                    'Login to create a trip itinerary.'
                                )
                            }
                        >
                            <div className="home-adventure-create-content">
                                <h3>Create New Trip</h3>
                                <p>Plan your next adventure from scratch</p>
                            </div>

                            <div className="home-adventure-create-bottom">
                                <span>Start →</span>
                            </div>
                        </Link>
                    ) : (
                        recentTrips
                            .slice(0, 2)
                            .map((trip, index) => (
                                <Link
                                    key={trip.id}
                                    to={`/trip-itinerary/${trip.id}`}
                                    className="home-adventure-card"
                                    style={{
                                        backgroundColor: tripColors[index % tripColors.length],
                                    }}
                                >
                                    <div className="home-adventure-card-content">
                                        <h4>
                                            {trip.trip_name}
                                        </h4>

                                        <p>
                                            {trip.locations_count ??
                                                trip.locations
                                                    ?.length ??
                                                0}{' '}
                                            stops ·{' '}
                                            {new Date(
                                                trip.created_at
                                            ).toLocaleDateString(
                                                'en-GB',
                                                {
                                                    day: 'numeric',
                                                    month: 'short',
                                                }
                                            )}
                                        </p>
                                    </div>

                                    <div className="home-adventure-card-bottom">
                                        <span className="home-adventure-card-arrow">
                                            View Trip →
                                        </span>
                                    </div>
                                </Link>
                            ))
                    )}
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
