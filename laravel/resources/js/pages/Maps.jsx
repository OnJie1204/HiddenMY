import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import "../../css/maps.css";

import {
    getMyHiddenGems,
    getPopularHiddenGems,
    getNearbyAttractions,
    getNearbyAttractionsAt,
    getHiddenGemsInBounds,
    getHiddenGemDetail,
} from "../api/hiddenGems";
import { getTripItineraries, addTripLocation } from "../api/TripItinerary";
import { getWishlist, addToWishlist, removeFromWishlist } from "../api/wishlist";

import {createGemClusterIcon} from "../components/GemClusterIcon";
import HiddenGemMarker from "../components/HiddenGemMarker";
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

function groupKey(lat, lng) {
    return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function Maps(){
    const location = useLocation();
    const highlightGem = location.state?.highlightGem || null;
    const highlightId = location.state?.highlightId || null;
    const [hiddenGems,setHiddenGems]=useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [userPosition,setUserPosition]=useState(null);
    const [locationError,setLocationError]=useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
    const [myGems,setMyGems]=useState([]);
    const [popularPosts,setPopularPosts]=useState([]);
    const [panelOpen, setPanelOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState(null); // null | 'hidden_gem' | 'pending_community_vote'
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

    // Lock background scroll while the map covers the screen, so the page behind
    // it can't scroll out from underneath the fixed-position hero.
    useEffect(() => {
        if (!mapFullscreen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
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
            api.get("/recent-hidden-gems")
                .then(res => setRecentPosts(res.data))
                .catch(err => console.log(err));

            getMyHiddenGems()
                .then(res => setMyGems(res.data.data || []))
                .catch(err => console.log(err));

            getPopularHiddenGems()
                .then(res => setPopularPosts(res.data || []))
                .catch(err => console.log(err));
        }, 200);

        return () => clearTimeout(id);
    }, []);

    const loadedPanelExtrasRef = useRef(false);
    useEffect(() => {
        if (!panelOpen || loadedPanelExtrasRef.current) return;
        loadedPanelExtrasRef.current = true;

        getTripItineraries()
            .then(res => setItineraries(res.data || []))
            .catch(err => console.log(err));

        getWishlist()
            .then(res => setWishlistIds(new Set((res.data.data || []).map(gem => gem.id))))
            .catch(err => console.log(err));
    }, [panelOpen]);

    useEffect(() => {
        if (highlightGem && highlightGem.id) {
            // Open the side panel with the highlighted gem
            setSelectedGroup([normalizeGem(highlightGem, "database")]);
            setPanelOpen(true);
            // Fly to the gem on the map
            if (mapRef.current) {
                mapRef.current.flyTo(
                    [Number(highlightGem.latitude), Number(highlightGem.longitude)],
                    Math.max(mapRef.current.getZoom(), GEM_FOCUS_ZOOM),
                    { duration: 1.5, easeLinearity: 0.25 }
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

        getHiddenGemsInBounds({
            north: viewport.north,
            south: viewport.south,
            east: viewport.east,
            west: viewport.west,
        }, statusFilter)
            .then(res => setHiddenGems(res.data.data || []))
            .catch(err => console.log(err));
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
            return {
                id: raw.id,
                source: "database",
                title: raw.place_name,
                state: raw.state,
                address: raw.address,
                description: raw.description,
                latitude: raw.latitude,
                longitude: raw.longitude,
                image: raw.first_image?.image_url || raw.images?.[0]?.image_url || null,
                voteCount: raw.vote_count,
                verificationThreshold: raw.verification_threshold,
                category: raw.category?.name,
                status: raw.status,
            };
        }
        return {
            id: raw.id,
            osmId: raw.osm_id,
            source: "attraction",
            title: raw.name,
            latitude: raw.latitude,
            longitude: raw.longitude,
            image: null,
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

    const handleActiveGemChange = useCallback((activeGem) => {
        if (!activeGem || activeGem.source !== "database") {
            setNearby([]);
            setNearbyLoading(false);
            setGemReviews([]);
            setGemReviewsLoading(false);
            return;
        }

        setNearbyLoading(true);
        getNearbyAttractions(activeGem.id)
            .then(res => setNearby(res.data.data || []))
            .catch(err => {
                console.log(err);
                setNearby([]);
            })
            .finally(() => setNearbyLoading(false));

        // detail only for whichever gem is actually open in the panel.
        setGemReviewsLoading(true);
        getHiddenGemDetail(activeGem.id)
            .then(res => setGemReviews(res.data.data?.votes || []))
            .catch(err => {
                console.log(err);
                setGemReviews([]);
            })
            .finally(() => setGemReviewsLoading(false));
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

    // Group hidden gems by coordinate
    const groupedGems = useMemo(() => {
        const map = new Map();
        hiddenGems.forEach(raw => {
            const gem = normalizeGem(raw, "database");
            const key = groupKey(gem.latitude, gem.longitude);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(gem);
        });
        return Array.from(map.values());
    }, [hiddenGems]);

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
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
                {groupedGems.map((group) => (
                    <HiddenGemMarker
                        key={groupKey(group[0].latitude, group[0].longitude)}
                        gem={group[0]}
                        postCount={group.length}
                        onClick={() => openGroup(group)}
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
                    <div className="maps-search-float">
                        <SearchBar
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
                                    openGroup([normalizeGem(item, "attraction")]);
                                    setSearchResults([item]);
                                }
                            }}
                        />
                    </div>

                    <SidePanel
                        group={selectedGroup}
                        isOpen={panelOpen}
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
                    />
                </div>

                {/* Right column: title, status, filters */}
                <div className="maps-hero-topbar">
                    <h1 className="maps-hero-title">HiddenMY Interactive Map</h1>
                    {locationError && (
                        <p className="maps-hero-status">{locationError}</p>
                    )}
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
                    {clickExploreOn && (
                        <p className="maps-hero-hint">Click anywhere on the map to search nearby</p>
                    )}
                    {exploreOn && viewport && viewport.zoom < EXPLORE_MIN_ZOOM && (
                        <p className="maps-hero-hint">Zoom in to load nearby attractions</p>
                    )}
                    {exploreLoading && (
                        <p className="maps-hero-hint">Loading nearby attractions</p>
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
                    onItemClick={selectGem}
                    emptyText="No recent gems yet."
                />
                <GemCarousel
                    title="My Hidden Gems"
                    seeMoreTo="/my-hidden-gems"
                    items={myGems}
                    onItemClick={selectGem}
                    emptyText="You haven't posted any hidden gems yet."
                />
                <GemCarousel
                    title="Popular Hidden Gems"
                    seeMoreTo="/hidden-gems"
                    items={popularPosts}
                    onItemClick={selectGem}
                    emptyText="No popular gems yet."
                />
            </div>
        </div>
    );
}

export default Maps;
