import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import "../../css/maps.css";
import { cartoTileUrl } from "../utils/cartoTiles";

import {
    getMyHiddenGems,
    getPopularHiddenGems,
    getNearbyAttractions,
    getNearbyAttractionsAt,
    getHiddenGemsInBounds,
    getHiddenGemDetail,
    getCategories,
} from "../api/hiddenGems";
import { getTripItineraries, addTripLocation } from "../api/TripItinerary";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";

import {createGemClusterIcon} from "../components/GemClusterIcon";
import HiddenGemMarker from "../components/HiddenGemMarker";
import Spinner from "../components/Spinner";
import SearchBar from "../components/SearchBar";
import SidePanel from "../components/SidePanel";
import AttractionMarker from "../components/AttractionMarker";
import GemCarousel from "../components/GemCarousel";

import api from "../api";


// Marker icon
const customIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

// Approximate latitude and longitude boundaries of Malaysia
const MALAYSIA_BOUNDS = [
    [0.5, 99.5],
    [7.5, 119.5],
];

// Shared fly-to easing so pans/zooms feel smooth rather than snapping instantly
const FLY_TO_OPTIONS = { duration: 1.1, easeLinearity: 0.25 };
const EXPLORE_MIN_ZOOM = 14;
const VIEWPORT_DEBOUNCE_MS = 500;
const EXPLORE_GRID = 100;

function gridCell(lat, lng) {
    return `${Math.round(lat * EXPLORE_GRID)}:${Math.round(lng * EXPLORE_GRID)}`;
}

const CLICK_EXPLORE_RADIUS = 1500;

const FOCUS_ZOOM = 15;

const GEM_FOCUS_ZOOM = 17;

function FlyToUser({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, Math.max(map.getZoom(), FOCUS_ZOOM), FLY_TO_OPTIONS);
        }
    }, [position, map]);
    return null;
}

function FlyToGem({ gem }) {
    const map = useMap();
    useEffect(() => {
        if (gem) {
            map.flyTo(
                [Number(gem.latitude), Number(gem.longitude)],
                Math.max(map.getZoom(), GEM_FOCUS_ZOOM),
                FLY_TO_OPTIONS
            );
        }
    }, [gem, map]);
    return null;
}

// Reports the map's visible bounds + zoom upward so the page can query
// hidden gems (and OSM places) for exactly what's on screen.
function ViewportWatcher({ onChange }) {
    const map = useMapEvents({
        moveend: () => report(),
        zoomend: () => report(),
    });

    function report() {
        const b = map.getBounds();
        const c = b.getCenter();
        onChange({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
            centerLat: c.lat,
            centerLng: c.lng,
            zoom: map.getZoom(),
            // rough on-screen radius, capped to what the API accepts
            radius: Math.min(3000, Math.round(map.distance(b.getNorthWest(), b.getSouthEast()) / 2)),
        });
    }

    useEffect(() => { report(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
}

const CLICK_EXPLORE_ZOOM = 16;

function MapClickExplorer({ onMapClick }) {
    const map = useMapEvents({
        click(e) {
            const target = e.originalEvent?.target;
            if (target?.closest?.('.leaflet-marker-icon, .leaflet-interactive')) {
                return;
            }
            // Zoom into the clicked spot so results near it are actually visible
            // as separate markers, rather than staying buried in a cluster.
            map.flyTo(e.latlng, Math.max(map.getZoom(), CLICK_EXPLORE_ZOOM), FLY_TO_OPTIONS);
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

function Maps({ user }){
    const location = useLocation();
    const navigate = useNavigate();

    // Mirrors the shared <BackButton> (which is suppressed on /map because the
    // full-bleed map hero has no room for it) — go back in history, or fall
    // back to home when this is the first entry in the stack.
    const handleBack = () => {
        if (location.key === 'default') {
            navigate('/');
        } else {
            navigate(-1);
        }
    };


    // ==================== URL Params (from HiddenGemDetail) ====================
    const queryParams = new URLSearchParams(location.search);
    const latParam = queryParams.get('lat');
    const lngParam = queryParams.get('lng');
    const gemIdParam = queryParams.get('gemId');
    
    const highlightGem = location.state?.highlightGem || null;
    const highlightId = location.state?.highlightId || null;
    const shouldOpenPanel = location.state?.openPanel || false;
    const shouldFlyTo = location.state?.flyTo || false;
    
    const [hiddenGems,setHiddenGems]=useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [userPosition,setUserPosition]=useState(null);
    const [locationError,setLocationError]=useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
    const [myGems,setMyGems]=useState([]);
    const [discoverLoading,setDiscoverLoading]=useState(true);
    const [boundsLoading,setBoundsLoading]=useState(false);
    const [popularPosts,setPopularPosts]=useState([]);
    const [panelOpen, setPanelOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState(null); // null | 'hidden_gem' | 'pending_community_vote'
    const [categories, setCategories] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState(null); // null = all categories
    const [wishlistOnly, setWishlistOnly] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [nearby, setNearby] = useState([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [explorePlaces, setExplorePlaces] = useState([]);
    const [exploreLoading, setExploreLoading] = useState(false);
    const [exploreOn, setExploreOn] = useState(true);
    // Off by default — click-to-search hits Overpass on every click, so it's
    // opt-in rather than always listening.
    const [clickExploreOn, setClickExploreOn] = useState(false);
    const [viewport, setViewport] = useState(null);
    const [clickedPoint, setClickedPoint] = useState(null);
    const [clickedPlaces, setClickedPlaces] = useState([]);
    const [clickedLoading, setClickedLoading] = useState(false);
    const [clickedError, setClickedError] = useState(false);
    const [itineraries, setItineraries] = useState([]);
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [gemReviews, setGemReviews] = useState([]);
    const [gemReviewsLoading, setGemReviewsLoading] = useState(false);
    const [activeGemImages, setActiveGemImages] = useState([]);
    const [mapFullscreen, setMapFullscreen] = useState(false);
    const mapRef = useRef(null);
    const viewportTimer = useRef(null);
    const heroRef = useRef(null);
    const clickedMarkerRef = useRef(null);

    // Open the "X places found nearby" popup as soon as a click lands, rather
    // than making the user click the little dot a second time to see it.
    useEffect(() => {
        if (clickedPoint) clickedMarkerRef.current?.openPopup();
    }, [clickedPoint, clickedLoading, clickedPlaces]);

    // Clear any dot/results left on the map when the feature is switched off,
    // rather than leaving a stale marker with no way to have produced it.
    useEffect(() => {
        if (!clickExploreOn) {
            setClickedPoint(null);
            setClickedPlaces([]);
        }
    }, [clickExploreOn]);

    useEffect(() => {
        if (!mapFullscreen) return;
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [mapFullscreen]);

    useEffect(() => {
        if (!mapRef.current) return;
        const id = setTimeout(() => mapRef.current?.invalidateSize(), 260);
        return () => clearTimeout(id);
    }, [mapFullscreen]);

    useEffect(() => {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;

        function measure() {
            document.documentElement.style.setProperty('--navbar-height', `${navbar.offsetHeight}px`);
        }

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    useEffect(() => {
        const id = setTimeout(() => {
            const jobs = [
                api.get("/recent-hidden-gems")
                    .then(res => setRecentPosts(res.data))
                    .catch(err => console.log(err)),

                user
                    ? getMyHiddenGems()
                        .then(res => setMyGems(res.data.data || []))
                        .catch(err => console.log(err))
                    : Promise.resolve(),

                getPopularHiddenGems()
                    .then(res => setPopularPosts(res.data || []))
                    .catch(err => console.log(err)),

                getCategories()
                    .then(res => setCategories(res.data.data || []))
                    .catch(err => console.log(err)),
            ];

            Promise.allSettled(jobs).then(() => setDiscoverLoading(false));
        }, 200);

        return () => clearTimeout(id);
    }, []);

    // Fetched independently of the panel (not gated on panelOpen) — the
    // "My Wishlist" map filter needs to know a user's wishlist before they've
    // ever opened a gem in the panel.
    useEffect(() => {
        if (!user) return;
        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(gem => gem.id))))
            .catch(err => console.log(err));
    }, [user]);

    const loadedPanelExtrasRef = useRef(false);
    useEffect(() => {
        if (!user || !panelOpen || loadedPanelExtrasRef.current) return;
        loadedPanelExtrasRef.current = true;

        const id = setTimeout(() => {
            getTripItineraries()
                .then(res => setItineraries(res.data || []))
                .catch(err => console.log(err));
        }, 300);

        return () => clearTimeout(id);
    }, [panelOpen, user]);

    // ==================== Handle URL params (from HiddenGemDetail) ====================
    useEffect(() => {
        if (!gemIdParam && !(latParam && lngParam)) return;

        const fetchGem = async () => {
            if (gemIdParam) {
                try {
                    const response = await getHiddenGemDetail(gemIdParam);
                    const gem = response.data.data;
                    
                    if (gem) {
                        const normalized = normalizeGem(gem, "database");
                        setSelectedGroup([normalized]);
                        setPanelOpen(true);
                        
                        if (mapRef.current) {
                            mapRef.current.flyTo(
                                [Number(gem.latitude), Number(gem.longitude)],
                                Math.max(mapRef.current.getZoom(), GEM_FOCUS_ZOOM),
                                FLY_TO_OPTIONS
                            );
                        }
                    }
                } catch (err) {
                    console.log("Error fetching gem for map:", err);
                }
            } else if (latParam && lngParam) {
                if (mapRef.current) {
                    mapRef.current.flyTo(
                        [Number(latParam), Number(lngParam)],
                        Math.max(mapRef.current.getZoom(), GEM_FOCUS_ZOOM),
                        FLY_TO_OPTIONS
                    );
                }
            }
        };

        // Small delay to ensure map is ready
        const timeout = setTimeout(fetchGem, 500);
        return () => clearTimeout(timeout);
    }, [gemIdParam, latParam, lngParam]);

    // ==================== Handle location.state.highlightGem ====================
    useEffect(() => {
        if (highlightGem && highlightGem.id) {
            const normalized = normalizeGem(highlightGem, "database");
            setSelectedGroup([normalized]);
            setPanelOpen(true);
            
            if (mapRef.current) {
                mapRef.current.flyTo(
                    [Number(highlightGem.latitude), Number(highlightGem.longitude)],
                    Math.max(mapRef.current.getZoom(), GEM_FOCUS_ZOOM),
                    FLY_TO_OPTIONS
                );
            }
        }
    }, [highlightGem]);

    const hasReportedViewportRef = useRef(false);
    const handleViewportChange = useCallback((next) => {
        clearTimeout(viewportTimer.current);

        if (!hasReportedViewportRef.current) {
            hasReportedViewportRef.current = true;
            setViewport(next);
            return;
        }

        viewportTimer.current = setTimeout(() => setViewport(next), VIEWPORT_DEBOUNCE_MS);
    }, []);

    useEffect(() => () => clearTimeout(viewportTimer.current), []);

    // Query hidden gems for whatever is currently on screen
    useEffect(() => {
        if (!viewport) return;

        setBoundsLoading(true);
        getHiddenGemsInBounds({
            north: viewport.north,
            south: viewport.south,
            east: viewport.east,
            west: viewport.west,
        }, statusFilter)
            .then(res => setHiddenGems(res.data.data || []))
            .catch(err => console.log(err))
            .finally(() => setBoundsLoading(false));
    }, [viewport, statusFilter]);

    const exploreCell = exploreOn && viewport && viewport.zoom >= EXPLORE_MIN_ZOOM
        ? gridCell(viewport.centerLat, viewport.centerLng)
        : null;

    useEffect(() => {
        if (!exploreCell) {
            setExplorePlaces([]);
            return;
        }

        let cancelled = false;
        setExploreLoading(true);
        const [cellLat, cellLng] = exploreCell.split(":").map(Number);

        getNearbyAttractionsAt(cellLat / EXPLORE_GRID, cellLng / EXPLORE_GRID, 1500)
            .then(res => { if (!cancelled) setExplorePlaces(res.data.data || []); })
            .catch(err => { if (!cancelled) { console.log(err); setExplorePlaces([]); } })
            .finally(() => { if (!cancelled) setExploreLoading(false); });

        return () => { cancelled = true; };
    }, [exploreCell]);

    // Normalize the gem shape
    function normalizeGem(raw, source) {
        if (source === "database") {
            // Laravel serializes decimal columns as JSON strings — coerce to
            // numbers here so every downstream consumer (jitter offsetting,
            // distance math, Leaflet's own position prop) gets real numbers
            // instead of silently falling into string concatenation.
            const latitude = Number(raw.latitude);
            const longitude = Number(raw.longitude);
            return {
                id: raw.id,
                source: "database",
                title: raw.place_name,
                state: raw.state,
                address: raw.address,
                description: raw.description,
                latitude,
                longitude,
                image: raw.first_image?.image_url || raw.images?.[0]?.image_url || null,
                voteCount: raw.vote_count,
                verificationThreshold: raw.verification_threshold,
                category: raw.category?.name,
                status: raw.status,
                reportStatus: raw.report_status,
                openingHours: raw.opening_hours,
                phone: raw.phone,
                website: raw.website,
                ratingAvg: raw.ratings_avg_rating != null ? Number(raw.ratings_avg_rating) : null,
                ratingCount: raw.ratings_count ?? 0,
                checkInsCount: raw.check_ins_count ?? 0,
                distanceKm: userPosition
                    ? L.latLng(userPosition).distanceTo(L.latLng(Number(latitude), Number(longitude))) / 1000
                    : null,
            };
        }
        return {
            id: raw.id,
            osmId: raw.osm_id,
            source: "attraction",
            title: raw.name,
            latitude: raw.latitude,
            longitude: raw.longitude,
            image: raw.image || null,
            attractionType: raw.type,
            address: raw.address,
            openingHours: raw.openingHours,
            phone: raw.phone,
            website: raw.website,
        };
    }

    // Shows a group of gems in the side panel (reopening it if it was closed)
    function openGroup(group) {
        setSelectedGroup(group);
        setPanelOpen(true);
    }

    function selectGem(raw) {
        openGroup([normalizeGem(raw, "database")]);
        // Cards live below the map, so without this the map flies to the gem
        // off-screen and the user never sees it happen.
        heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function selectAttraction(item) {
        getNearbyAttractionsAt(item.latitude, item.longitude, 150)
            .then((res) => {
                const candidates = res.data.data || [];
                const resolved = candidates.find((c) => c.name === item.name) || candidates[0] || item;
                openGroup([normalizeGem(resolved, "attraction")]);
                setSearchResults([resolved]);
            })
            .catch((err) => {
                console.log(err);
                openGroup([normalizeGem(item, "attraction")]);
                setSearchResults([item]);
            });
    }

    const activeGemIdRef = useRef(null);

    const handleActiveGemChange = useCallback((activeGem) => {
        activeGemIdRef.current = activeGem?.id ?? null;

        if (!activeGem || activeGem.source !== "database") {
            setNearby([]);
            setNearbyLoading(false);
            setGemReviews([]);
            setGemReviewsLoading(false);
            setActiveGemImages([]);
            return;
        }

        // detail only for whichever gem is actually open in the panel.
        setGemReviewsLoading(true);
        setActiveGemImages([]);
        getHiddenGemDetail(activeGem.id)
            .then(res => {
                setGemReviews(res.data.data?.votes || []);
                setActiveGemImages(res.data.data?.images || []);
            })
            .catch(err => {
                console.log(err);
                setGemReviews([]);
                setActiveGemImages([]);
            })
            .finally(() => setGemReviewsLoading(false));

        setNearbyLoading(true);
        setTimeout(() => {
            if (activeGemIdRef.current !== activeGem.id) return;

            getNearbyAttractions(activeGem.id)
                .then(res => {
                    if (activeGemIdRef.current !== activeGem.id) return;
                    setNearby(res.data.data || []);
                })
                .catch(err => {
                    console.log(err);
                    if (activeGemIdRef.current === activeGem.id) setNearby([]);
                })
                .finally(() => {
                    if (activeGemIdRef.current === activeGem.id) setNearbyLoading(false);
                });
        }, 400);
    }, []);

    const selectNearby = useCallback((place) => {
        openGroup([normalizeGem(place, "attraction")]);
    }, []);

    // Click anywhere on the map (not a marker) to see what's nearby that point.
    const handleMapClick = useCallback((lat, lng) => {
        setClickedPoint([lat, lng]);
        setClickedLoading(true);
        setClickedError(false);
        getNearbyAttractionsAt(lat, lng, CLICK_EXPLORE_RADIUS)
            .then(res => setClickedPlaces(res.data.data || []))
            .catch(err => {
                console.log(err);
                // used to render as 0 places with no way to tell them apart.
                setClickedError(true);
                setClickedPlaces([]);
            })
            .finally(() => setClickedLoading(false));
    }, []);

    const handleAddToItinerary = useCallback((trip, gem) => {
        const payload = gem.source === "database"
            ? { source: "database", location_id: gem.id }
            : {
                source: "openstreetmap",
                osm_id: gem.osmId,
                osm_name: gem.title,
                latitude: gem.latitude,
                longitude: gem.longitude,
            };

        return addTripLocation(trip.id, payload);
    }, []);

    const handleToggleWishlist = useCallback(async (gem, isWishlisted) => {
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
    }, []);

    const normalizedGems = useMemo(() => {
        let gems = hiddenGems.map(raw => normalizeGem(raw, "database"));

        if (categoryFilter) {
            gems = gems.filter(g => g.category === categoryFilter);
        }
        if (wishlistOnly) {
            gems = gems.filter(g => wishlistIds.has(g.id));
        }

        const seenAt = new Map();
        const JITTER_DEGREES = 0.00004; // 4m

        return gems.map((gem) => {
            const key = `${gem.latitude},${gem.longitude}`;
            const index = seenAt.get(key) ?? 0;
            seenAt.set(key, index + 1);

            if (index === 0) return gem;

            const angle = index * 137.5 * (Math.PI / 180); // golden-angle spread
            return {
                ...gem,
                latitude: gem.latitude + Math.cos(angle) * JITTER_DEGREES,
                longitude: gem.longitude + Math.sin(angle) * JITTER_DEGREES,
            };
        });
    }, [hiddenGems, userPosition, categoryFilter, wishlistOnly, wishlistIds]);

    // OSM markers to draw: the selected gem's neighbours, the zoom-in discovery
    // results, a map-click explore, and any search hits — de-duplicated by id.
    const osmMarkers = useMemo(() => {
        const byId = new Map();
        [...nearby, ...explorePlaces, ...clickedPlaces, ...searchResults].forEach(p => {
            if (p && p.id != null && !byId.has(p.id)) byId.set(p.id, p);
        });
        return Array.from(byId.values());
    }, [nearby, explorePlaces, clickedPlaces, searchResults]);

    // Get user location
    useEffect(()=>{
        if(!navigator.geolocation){
            setLocationError("Location not supported");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserPosition([pos.coords.latitude, pos.coords.longitude]);
            },
            (err) => {
                setLocationError('Unable to obtain location: ' + err.message);
            }
        );
    }, []);

    function recenterOnUser() {
        if (userPosition && mapRef.current) {
            mapRef.current.flyTo(userPosition, Math.max(mapRef.current.getZoom(), FOCUS_ZOOM), FLY_TO_OPTIONS);
        }
    }

    const defaultCenter = [4.2105, 101.9758];

    const statusFilters = [
        { value: null, label: "All" },
        { value: "hidden_gem", label: "Hidden Gem" },
        { value: "pending_community_vote", label: "Awaiting Votes" },
    ];

    const activeFilterCount = (statusFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (wishlistOnly ? 1 : 0);

    return (
        <div className="maps-page">
            <div className={`maps-hero ${mapFullscreen ? "fullscreen" : ""}`} ref={heroRef}>
                <MapContainer
                    ref={mapRef}
                    center={userPosition || defaultCenter}
                    zoom={7}
                    minZoom={6}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    wheelPxPerZoomLevel={70}
                    maxBounds={MALAYSIA_BOUNDS}
                    maxBoundsViscosity={1.0}
                    zoomControl={false}
                    style={{ height: '100%', width: '100%' }}
                >
                <TileLayer
                    url={cartoTileUrl("rastertiles/voyager")}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <ZoomControl position="bottomright" />
                <ScaleControl position="bottomright" imperial={false} />
                <ViewportWatcher onChange={handleViewportChange} />
                {clickExploreOn && <MapClickExplorer onMapClick={handleMapClick} />}
                {userPosition &&
                    <>
                    <Marker position={userPosition} icon={customIcon}>
                        <Popup>Your Current Location</Popup>
                    </Marker>
                    <FlyToUser position={userPosition}/>
                    </>
                }
                <MarkerClusterGroup iconCreateFunction={createGemClusterIcon} zoomToBoundsOnClick={true} spiderfyOnMaxZoom={true}>
                {normalizedGems.map((gem) => (
                    <HiddenGemMarker
                        key={gem.id}
                        gem={gem}
                        onClick={() => openGroup([gem])}
                    />
                ))}
            </MarkerClusterGroup>
                {osmMarkers.map((place) => (
                    <AttractionMarker
                        key={place.id}
                        place={place}
                        onClick={() => selectNearby(place)}
                    />
                ))}
                {clickedPoint && (
                    <CircleMarker
                        ref={clickedMarkerRef}
                        center={clickedPoint}
                        radius={8}
                        pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.9, weight: 2 }}
                    >
                        <Popup>
                            {clickedLoading
                                ? "Looking for nearby attractions"
                                : clickedError
                                    ? "Couldn't reach OpenStreetMap — try again"
                                    : `${clickedPlaces.length} place${clickedPlaces.length === 1 ? "" : "s"} found nearby`}
                        </Popup>
                    </CircleMarker>
                )}
                <FlyToGem gem={selectedGroup ? selectedGroup[0] : null}/>
                </MapContainer>

                {/* Left column: search box always visible, gem panel docked beneath it */}
                <div className="maps-left-stack">
                    <button
                        type="button"
                        className="maps-back-btn"
                        onClick={handleBack}
                    >
                        ← Back
                    </button>
                    <div className="maps-search-float">
                        <SearchBar
                            userLatitude={userPosition?.[0]}
                            userLongitude={userPosition?.[1]}
                            onSelect={(item) => {
                                if (item.source === "database") {
                                    setSearchResults([]);
                                    // Gems load per-viewport, so a search hit may not be
                                    // in `hiddenGems` yet — fall back to fetching it by id.
                                    const loaded = hiddenGems.find(g => g.id === item.id);
                                    if (loaded) {
                                        selectGem(loaded);
                                    } else {
                                        getHiddenGemDetail(item.id)
                                            .then(res => selectGem(res.data.data))
                                            .catch(err => console.log(err));
                                    }
                                } else {
                                    selectAttraction(item);
                                }
                            }}
                        />
                    </div>

                    <SidePanel
                        group={selectedGroup}
                        isOpen={panelOpen}
                        user={user}
                        onClose={() => { setPanelOpen(false); setSelectedGroup(null); }}
                        mode="gems"
                        nearby={nearby}
                        nearbyLoading={nearbyLoading}
                        onSelectNearby={selectNearby}
                        onGemChange={handleActiveGemChange}
                        itineraries={itineraries}
                        onAddToItinerary={handleAddToItinerary}
                        wishlistIds={wishlistIds}
                        onToggleWishlist={handleToggleWishlist}
                        reviews={gemReviews}
                        reviewsLoading={gemReviewsLoading}
                        images={activeGemImages}
                    />
                </div>

                {/* Right column: title, status, filters */}
                <div className="maps-hero-topbar">
                    <h1 className="maps-hero-title">HiddenMY Interactive Map</h1>
                    {boundsLoading && (
                        <div className="maps-updating-pill">
                            <Spinner size="sm" inline label="Updating gems…" />
                        </div>
                    )}
                    {locationError && (
                        <p className="maps-hero-status">{locationError}</p>
                    )}

                    <button
                        type="button"
                        className={`maps-filters-toggle ${filtersOpen ? "active" : ""}`}
                        onClick={() => setFiltersOpen(o => !o)}
                    >
                        Filters
                        {activeFilterCount > 0 && <span className="maps-filters-badge">{activeFilterCount}</span>}
                        <span className="maps-filters-toggle-arrow">{filtersOpen ? "▲" : "▼"}</span>
                    </button>

                    {filtersOpen && (
                        <div className="maps-filters-panel">
                            <div className="maps-filters-group">
                                <span className="maps-filters-group-label">Status</span>
                                <div className="maps-category-pills">
                                    {statusFilters.map((f) => (
                                        <button
                                            type="button"
                                            key={f.label}
                                            className={`maps-category-pill ${statusFilter === f.value ? "active" : ""}`}
                                            onClick={() => setStatusFilter(f.value)}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {categories.length > 0 && (
                                <div className="maps-filters-group">
                                    <span className="maps-filters-group-label">Category</span>
                                    <div className="maps-category-pills">
                                        <button
                                            type="button"
                                            className={`maps-category-pill ${!categoryFilter ? "active" : ""}`}
                                            onClick={() => setCategoryFilter(null)}
                                        >
                                            All
                                        </button>
                                        {categories.map((c) => (
                                            <button
                                                type="button"
                                                key={c.id}
                                                className={`maps-category-pill ${categoryFilter === c.name ? "active" : ""}`}
                                                onClick={() => setCategoryFilter(c.name)}
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="maps-filters-group">
                                <span className="maps-filters-group-label">Discovery</span>
                                <div className="maps-category-pills">
                                    {user && (
                                        <button
                                            type="button"
                                            className={`maps-category-pill ${wishlistOnly ? "active" : ""}`}
                                            onClick={() => setWishlistOnly(o => !o)}
                                            title="Only show gems on your wishlist"
                                        >
                                            ♥ My wishlist
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={`maps-category-pill ${exploreOn ? "active" : ""}`}
                                        onClick={() => setExploreOn(o => !o)}
                                        title={`Show nearby attractions from OpenStreetMap once zoomed in (level ${EXPLORE_MIN_ZOOM}+)`}
                                    >
                                        Nearby attractions
                                    </button>
                                    <button
                                        type="button"
                                        className={`maps-category-pill ${clickExploreOn ? "active" : ""}`}
                                        onClick={() => setClickExploreOn(o => !o)}
                                        title="When on, clicking anywhere on the map searches for nearby attractions at that point"
                                    >
                                        Click to scan
                                    </button>
                                </div>
                            </div>

                            <div className="maps-filters-group">
                                <span className="maps-filters-group-label">Legend</span>
                                <div className="maps-legend">
                                    <span className="maps-legend-item">
                                        <img src="/images/gem_marker.png" alt="" className="maps-legend-icon" />
                                        Hidden gem (verified)
                                    </span>
                                    <span className="maps-legend-item">
                                        <img src="/images/gem_marker.png" alt="" className="maps-legend-icon maps-legend-icon-dim" />
                                        Hidden gem (awaiting votes)
                                    </span>
                                    <span className="maps-legend-item">
                                        <span className="maps-legend-swatch" style={{ background: "#f97316" }} />
                                        Other (OSM attraction) — pin, colored/iconed by type
                                    </span>
                                    <span className="maps-legend-hint">The gem icon vs. a colored pin always tells them apart, regardless of category.</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {clickExploreOn && (
                        <p className="maps-hero-hint">Click anywhere on the map to search nearby</p>
                    )}
                    {exploreOn && viewport && viewport.zoom < EXPLORE_MIN_ZOOM && (
                        <p className="maps-hero-hint">Zoom in to load nearby attractions</p>
                    )}
                    {exploreLoading && (
                        <Spinner size="sm" inline label="Loading nearby attractions…" className="maps-hero-hint" />
                    )}
                    {!exploreLoading && exploreOn && explorePlaces.length > 0 && (
                        <p className="maps-hero-hint">{explorePlaces.length} places in view</p>
                    )}
                </div>

                {userPosition && (
                    <button
                        type="button"
                        className="maps-locate-btn"
                        onClick={recenterOnUser}
                        aria-label="Center on my location"
                        title="Center on my location"
                    >
                        🎯
                    </button>
                )}

                <button
                    type="button"
                    className="maps-fullscreen-btn"
                    onClick={() => setMapFullscreen(f => !f)}
                    aria-label={mapFullscreen ? "Exit fullscreen" : "Fullscreen map"}
                    title={mapFullscreen ? "Exit fullscreen" : "Fullscreen map"}
                >
                    {mapFullscreen ? "⤡" : "⤢"}
                </button>
            </div>

            <div className="maps-discover">
                <GemCarousel
                    title="Recent Hidden Gems"
                    seeMoreTo="/hidden-gems"
                    items={recentPosts}
                    loading={discoverLoading}
                    onItemClick={selectGem}
                    emptyText="No recent gems yet."
                />
                {user && (
                    <GemCarousel
                        title="My Hidden Gems"
                        seeMoreTo="/my-hidden-gems"
                        items={myGems}
                        loading={discoverLoading}
                        onItemClick={selectGem}
                        emptyText="You haven't posted any hidden gems yet."
                    />
                )}
                <GemCarousel
                    title="Popular Hidden Gems"
                    seeMoreTo="/hidden-gems"
                    items={popularPosts}
                    loading={discoverLoading}
                    onItemClick={selectGem}
                    emptyText="No popular gems yet."
                />
            </div>
        </div>
    );
}

export default Maps;
