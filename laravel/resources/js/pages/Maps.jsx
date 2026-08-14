import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, ZoomControl, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
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

import {createGemClusterIcon} from "../components/GemClusterIcon";
import HiddenGemMarker from "../components/HiddenGemMarker";
import SearchBar from "../components/SearchBar";
import SidePanel from "../components/SidePanel";
import AttractionMarker from "../components/AttractionMarker";
import GemCarousel from "../components/GemCarousel";

import malaysia from "../assets/MYS.geo.json";

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

// Zoomed in at least this far before we start pulling OSM places for the viewport.
// Any wider and the radius covers half a state, which Overpass won't answer usefully.
const EXPLORE_MIN_ZOOM = 14;

const VIEWPORT_DEBOUNCE_MS = 500;

// Overpass is rate-limited per IP, so the explore fetch is gated to a ~1.1km grid
// (matching the server's cache grid): panning within one cell reuses the last result
// instead of firing a fresh request on every pan.
const EXPLORE_GRID = 100; // 1/0.01 degrees

function gridCell(lat, lng) {
    return `${Math.round(lat * EXPLORE_GRID)}:${Math.round(lng * EXPLORE_GRID)}`;
}

function FlyToUser({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, 15, FLY_TO_OPTIONS);
        }
    }, [position, map]);
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

function groupKey(lat, lng) {
    return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function Maps(){
    const [hiddenGems,setHiddenGems]=useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [userPosition,setUserPosition]=useState(null);
    const [locationError,setLocationError]=useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
    const [myGems,setMyGems]=useState([]);
    const [popularPosts,setPopularPosts]=useState([]);
    const [panelOpen, setPanelOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState(null); // null | 'verified' | 'pending'
    const [nearby, setNearby] = useState([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [explorePlaces, setExplorePlaces] = useState([]);
    const [exploreLoading, setExploreLoading] = useState(false);
    const [exploreOn, setExploreOn] = useState(true);
    const [viewport, setViewport] = useState(null);
    const [itineraries, setItineraries] = useState([]);
    const mapRef = useRef(null);
    const viewportTimer = useRef(null);

    // Load recent hidden gems
    useEffect(()=>{
        api.get("/recent-hidden-gems")
            .then(res=>setRecentPosts(res.data))
            .catch(err => console.log(err));
    },[]);

    // Load the current user's own hidden gems
    useEffect(()=>{
        getMyHiddenGems()
            .then(res => setMyGems(res.data.data || []))
            .catch(err => console.log(err));
    },[]);

    // Load top-voted, verified hidden gems
    useEffect(()=>{
        getPopularHiddenGems()
            .then(res => setPopularPosts(res.data || []))
            .catch(err => console.log(err));
    },[]);

    // Load the user's trip itineraries so gems can be added straight from the map
    useEffect(()=>{
        getTripItineraries()
            .then(res => setItineraries(res.data || []))
            .catch(err => console.log(err));
    },[]);

    // Debounce viewport changes so panning doesn't spam the API
    const handleViewportChange = useCallback((next) => {
        clearTimeout(viewportTimer.current);
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

    // Once zoomed in far enough, surface OSM places for the visible area.
    // Keyed on the grid cell rather than the raw viewport so small pans don't
    // re-request (Overpass 429s aggressively and each failure costs the timeout).
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
                image: raw.images?.[0]?.image_url || null,
                voteCount: raw.vote_count,
                verificationThreshold: raw.verification_threshold,
                category: raw.category?.name,
                status: raw.status,
            };
        }
        // OSM / attraction result
        return {
            id: raw.id,
            osmId: raw.osm_id,
            source: "attraction",
            title: raw.name,
            latitude: raw.latitude,
            longitude: raw.longitude,
            image: null,
        };
    }

    // Shows a group of gems in the side panel (reopening it if it was closed)
    function openGroup(group) {
        setSelectedGroup(group);
        setPanelOpen(true);
    }

    function selectGem(raw) {
        openGroup([normalizeGem(raw, "database")]);
    }

    // Fires whenever the panel's displayed gem changes (reported up from SidePanel).
    // Fetches the "Near this gem" list. Wrapped in useCallback so SidePanel's effect
    // doesn't re-fire — and re-hit Overpass — on unrelated re-renders.
    const handleActiveGemChange = useCallback((activeGem) => {
        if (!activeGem || activeGem.source !== "database") {
            setNearby([]);
            setNearbyLoading(false);
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
    }, []);

    const selectNearby = useCallback((place) => {
        openGroup([normalizeGem(place, "attraction")]);
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
    // results, and any search hits — de-duplicated by id.
    const osmMarkers = useMemo(() => {
        const byId = new Map();
        [...nearby, ...explorePlaces, ...searchResults].forEach(p => {
            if (p && p.id != null && !byId.has(p.id)) byId.set(p.id, p);
        });
        return Array.from(byId.values());
    }, [nearby, explorePlaces, searchResults]);

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
            mapRef.current.flyTo(userPosition, 15, FLY_TO_OPTIONS);
        }
    }

    const defaultCenter = [4.2105, 101.9758];

    function FlyToGem({ gem }) {
        const map = useMap();
        useEffect(() => {
            if (gem) {
                map.flyTo(
                    [Number(gem.latitude), Number(gem.longitude)], 15, FLY_TO_OPTIONS
                );
            }
        }, [gem]);
        return null;
    }

    const statusFilters = [
        { value: null, label: "All" },
        { value: "verified", label: "✓ Verified" },
        { value: "pending", label: "⏳ Unverified" },
    ];

    return (
        <div className="maps-page">
            <div className="maps-hero">
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
                <GeoJSON
                    data={malaysia}
                    style={{
                        color: "#14b8a6",
                        weight: 2,
                        fillColor: "#14b8a6",
                        fillOpacity: 0.12,
                    }}
                />
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
                            title={`Show nearby places from OpenStreetMap once zoomed in (level ${EXPLORE_MIN_ZOOM}+)`}
                        >
                            🔎 Nearby places
                        </button>
                    </div>
                    {exploreOn && viewport && viewport.zoom < EXPLORE_MIN_ZOOM && (
                        <p className="maps-hero-hint">Zoom in to load nearby places</p>
                    )}
                    {exploreLoading && (
                        <p className="maps-hero-hint">Loading nearby places…</p>
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
