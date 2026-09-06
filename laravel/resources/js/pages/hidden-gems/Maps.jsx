import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import "@css/modules/maps.css";
import { cartoTileUrl } from "@/utils/maps/cartoTiles";

import {
    getMyHiddenGems,
    getPopularHiddenGems,
    getNearbyAttractions,
    getNearbyAttractionsAt,
    getNearbyGems,
    getHiddenGemsInBounds,
    getHiddenGemDetail,
    getCategories,
    getRecentHiddenGems,
} from "@/features/hidden-gems/api";
import { getTripItineraries, addTripLocation } from "@/features/travel/tripItinerariesApi";
import { getWishlist, addToWishlist, removeFromWishlist } from "@/features/users/wishlistApi";
import { getInteractions } from "@/features/community/interactionsApi";

import {createGemClusterIcon} from "@/components/hidden-gems/GemClusterIcon";
import HiddenGemMarker from "@/components/hidden-gems/HiddenGemMarker";
import Spinner from "@/components/common/Spinner";
import SearchBar from "@/components/hidden-gems/SearchBar";
import SidePanel from "@/components/hidden-gems/SidePanel";
import AttractionMarker from "@/components/hidden-gems/AttractionMarker";
import GemCarousel from "@/components/hidden-gems/GemCarousel";
import { sanitizeIntent } from "@/utils/auth/authRedirect";

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

// Filter selections are kept in sessionStorage so that navigating away (e.g.
// opening a gem's full detail page) and coming back returns to the map with the
// same filters still applied, instead of resetting to the defaults.
const MAP_STATUS_FILTER_KEY = "mapStatusFilter";
const MAP_CATEGORY_FILTER_KEY = "mapCategoryFilter";
const MAP_WISHLIST_ONLY_KEY = "mapWishlistOnly";

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

// Brings the selected gem into view and centers it — without ever handing the
// cluster group a new marker list, so an expanded/spiderfied cluster stays
// exactly as the user left it.
//   - marker already visible AND we're already zoomed in close (spiderfied
//     markers only exist at/near max cluster zoom, which sits above this):
//     plain panTo, no zoom change, so an open spiderfy isn't disturbed.
//   - marker visible but the view is still wide (e.g. a standalone gem
//     clicked at a country-wide zoom): flyTo with a zoom bump. A plain pan
//     can't recenter here — maxBounds/maxBoundsViscosity clamps horizontal
//     panning once the visible span is close to the bounds' own width, which
//     a wide zoom easily hits. Zooming in first shrinks the span so the pan
//     is no longer fighting the bounds clamp.
//   - gem still inside a collapsed cluster (picked from search): let the
//     cluster group zoom / spiderfy until the pin shows, then center it.
//   - OSM attraction / marker not loaded: same zoom-bump flyTo.
function RevealSelectedGem({ gem, clusterRef, markerRefs }) {
    const map = useMap();
    useEffect(() => {
        if (!gem) return;

        const target = [Number(gem.latitude), Number(gem.longitude)];
        const marker = gem.source === "database" ? markerRefs.current[gem.id] : null;

        if (marker?.getElement?.()) {
            if (map.getZoom() >= GEM_FOCUS_ZOOM) {
                map.panTo(target, FLY_TO_OPTIONS);
            } else {
                map.flyTo(target, GEM_FOCUS_ZOOM, FLY_TO_OPTIONS);
            }
            return;
        }

        if (marker && clusterRef.current) {
            clusterRef.current.zoomToShowLayer(marker, () => {
                map.flyTo(target, Math.max(map.getZoom(), GEM_FOCUS_ZOOM), FLY_TO_OPTIONS);
            });
            return;
        }

        map.flyTo(target, Math.max(map.getZoom(), GEM_FOCUS_ZOOM), FLY_TO_OPTIONS);
    }, [gem, map, clusterRef, markerRefs]);
    return null;
}

// Glows the selected gem's marker by toggling a class on its DOM element
// (never via the `icon` prop or the marker list, which would re-cluster).
// Re-applied on zoom/pan since a marker that was clustered has no element
// until the cluster group reveals it.
function SelectedGemHighlight({ selectedId, markerRefs, clusterRef }) {
    const target = selectedId == null ? null : String(selectedId);
    const targetRef = useRef(target);
    targetRef.current = target;

    const applyHighlight = () => {
        const want = targetRef.current;
        Object.entries(markerRefs.current).forEach(([id, marker]) => {
            const element = marker?.getElement?.();
            if (!element) return;
            element.classList.toggle("hidden-gem-marker-selected", id === want);
        });
    };

    // The selected marker may only get a DOM element once the cluster group
    // finishes zooming / spiderfying — which isn't a plain map event — so
    // re-apply on the cluster's own animation events and a short retry window.
    useEffect(() => {
        applyHighlight();
        const timers = [80, 250, 500, 900].map((t) => setTimeout(applyHighlight, t));
        return () => timers.forEach(clearTimeout);
    }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

    useMapEvents({
        zoomend: applyHighlight,
        moveend: applyHighlight,
    });

    useEffect(() => {
        const cluster = clusterRef.current;
        if (!cluster) return;
        cluster.on("spiderfied unspiderfied animationend", applyHighlight);
        return () => cluster.off("spiderfied unspiderfied animationend", applyHighlight);
    }, [clusterRef]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // A gem action a guest started before logging in (the login flow returns
    // them to `/map?gemId=<id>`). Captured on first render — the effects below
    // sync map params to the URL and would wipe location.state first. Handed to
    // SidePanel, which resumes it once that gem is loaded, then calls
    // onResumeConsumed to clear it from history.
    const [resumeIntent] = useState(() => sanitizeIntent(location.state?.resumeIntent));
    const clearResumeIntent = useCallback(() => {
        navigate(`${window.location.pathname}${window.location.search}`, { replace: true, state: null });
    }, [navigate]);

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
    const [statusFilter, setStatusFilter] = useState(() =>
        sessionStorage.getItem(MAP_STATUS_FILTER_KEY) || null
    ); // null | 'hidden_gem' | 'pending_community_vote'
    const [categories, setCategories] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState(() => { // [] = all categories, otherwise a set of selected category names
        try {
            const stored = sessionStorage.getItem(MAP_CATEGORY_FILTER_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [wishlistOnly, setWishlistOnly] = useState(() =>
        sessionStorage.getItem(MAP_WISHLIST_ONLY_KEY) === "1"
    );
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
    const [itinerariesLoading, setItinerariesLoading] = useState(false);
    const [wishlistIds, setWishlistIds] = useState(() => new Set());
    const [wishlistToast, setWishlistToast] = useState("");
    const [gemReviews, setGemReviews] = useState([]);
    const [gemReviewsLoading, setGemReviewsLoading] = useState(false);
    const [activeGemImages, setActiveGemImages] = useState([]);
    const [mapFullscreen, setMapFullscreen] = useState(false);
    const mapRef = useRef(null);
    const viewportTimer = useRef(null);
    const heroRef = useRef(null);
    const clickedMarkerRef = useRef(null);
    // Leaflet marker instances keyed by gem id (for the imperative glow) and
    // the underlying L.MarkerClusterGroup (for zoomToShowLayer on select).
    const gemMarkerRefs = useRef({});
    const gemClusterRef = useRef(null);
    // The padded bounds + status filter of the last successful gem fetch.
    // Panning / zooming inside this area reuses what's already loaded instead
    // of hitting the API again on every moveend.
    const loadedGemsRef = useRef(null);

    // The app has no global scroll restoration, so navigating here from a
    // scrolled page would land partway down this (tall) page — reset to top.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

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
                getRecentHiddenGems()
                    .then(res => setRecentPosts(
                        (res.data || []).filter(
                            gem => !gem.permanently_closed_at && !gem.permanentlyClosedAt
                        )
                    ))
                    .catch(err => console.log(err)),

                user
                    ? getMyHiddenGems()
                        .then(res => setMyGems(
                            (res.data.data || []).filter(
                                gem => !gem.permanently_closed_at && !gem.permanentlyClosedAt
                            )
                        ))
                        .catch(err => console.log(err))
                    : Promise.resolve(),

                getPopularHiddenGems()
                    .then(res => setPopularPosts(
                        (res.data || []).filter(
                            gem => !gem.permanently_closed_at && !gem.permanentlyClosedAt
                        )
                    ))
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
            setItinerariesLoading(true);
            getTripItineraries()
                .then(res => setItineraries(res.data || []))
                .catch(err => console.log(err))
                .finally(() => setItinerariesLoading(false));
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

    // Query hidden gems for whatever is currently on screen — but only when
    // the view has actually left the area we already loaded (or the status
    // filter changed), so small pans/zooms don't keep re-hitting the API.
    useEffect(() => {
        if (!viewport) return;

        const loaded = loadedGemsRef.current;
        const stillCovered =
            loaded &&
            loaded.statusFilter === statusFilter &&
            viewport.north <= loaded.bounds.north &&
            viewport.south >= loaded.bounds.south &&
            viewport.east <= loaded.bounds.east &&
            viewport.west >= loaded.bounds.west;

        if (stillCovered) return;

        // Fetch a margin beyond the screen so a nudge in any direction stays
        // within the loaded area.
        const latPad = (viewport.north - viewport.south) * 0.5;
        const lngPad = (viewport.east - viewport.west) * 0.5;
        const bounds = {
            north: viewport.north + latPad,
            south: viewport.south - latPad,
            east: viewport.east + lngPad,
            west: viewport.west - lngPad,
        };

        setBoundsLoading(true);
        getHiddenGemsInBounds(bounds, statusFilter)
            .then(res => {
                setHiddenGems(res.data.data || []);
                loadedGemsRef.current = { bounds, statusFilter };
            })
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
                permanentlyClosedAt: raw.permanently_closed_at ?? null,
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

    // Shows a group of gems in the side panel (reopening it if it was closed).
    // Stable so the memoized marker list below never changes just because a
    // gem was selected.
    const openGroup = useCallback((group) => {
        setSelectedGroup(group);
        setPanelOpen(true);
    }, []);

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
                setActiveGemImages(res.data.data?.images || []);
            })
            .catch(err => {
                console.log(err);
                setActiveGemImages([]);
            });

        // The panel's "Reviews" are travellers' star ratings and comments
        // (GemInteraction type=comment) — not the community verification votes
        // the gem detail payload carries, which only say who voted.
        getInteractions(activeGem.id)
            .then(res => {
                setGemReviews(res.data?.comments || []);
            })
            .catch(err => {
                console.log(err);
                setGemReviews([]);
            })
            .finally(() => setGemReviewsLoading(false));

        setNearbyLoading(true);
        setTimeout(() => {
            if (activeGemIdRef.current !== activeGem.id) return;
            Promise.allSettled([
                getNearbyGems(activeGem.id),
                getNearbyAttractions(activeGem.id),
            ]).then(([gemsResult, attractionsResult]) => {
                if (activeGemIdRef.current !== activeGem.id) return;

                const nearbyGems = gemsResult.status === "fulfilled" ? (gemsResult.value.data.data || []) : [];
                const nearbyAttractions = attractionsResult.status === "fulfilled" ? (attractionsResult.value.data.data || []) : [];
                if (gemsResult.status === "rejected") console.log(gemsResult.reason);
                if (attractionsResult.status === "rejected") console.log(attractionsResult.reason);

                setNearby([...nearbyGems, ...nearbyAttractions].sort((a, b) => a.distance - b.distance));
            }).finally(() => {
                if (activeGemIdRef.current === activeGem.id) setNearbyLoading(false);
            });
        }, 400);
    }, []);

    const selectNearby = useCallback((place) => {
        if (place.source === "database") {
            openGroup([normalizeGem({
                id: place.id,
                place_name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
                category: { name: place.type },
                status: place.status,
            }, "database")]);
            return;
        }
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
            setWishlistToast("Removed from wishlist");
        } else {
            await addToWishlist(gem.id);
            setWishlistIds(prev => new Set(prev).add(gem.id));
            setWishlistToast("Added to wishlist");
        }
    }, []);

    // Auto-dismiss the wishlist toast after a few seconds.
    useEffect(() => {
        if (!wishlistToast) return;

        const timer = setTimeout(() => setWishlistToast(""), 3000);

        return () => clearTimeout(timer);
    }, [wishlistToast]);

    const normalizedGems = useMemo(() => {
        let gems = hiddenGems.map(raw => normalizeGem(raw, "database"));

        if (categoryFilter.length > 0) {
            gems = gems.filter(g => categoryFilter.includes(g.category));
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

    // The marker elements handed to <MarkerClusterGroup>. Memoized so they
    // only change when the gems themselves change — selecting a gem must not
    // produce a new array, or the cluster group re-clusters everything and
    // collapses any expanded/spiderfied cluster.
    const gemMarkers = useMemo(
        () =>
            normalizedGems.map((gem) => (
                <HiddenGemMarker
                    key={gem.id}
                    gem={gem}
                    markerRefs={gemMarkerRefs}
                    onClick={() => openGroup([gem])}
                />
            )),
        [normalizedGems, openGroup],
    );

    // OSM markers to draw: the selected gem's neighbours, the zoom-in discovery
    // results, a map-click explore, and any search hits — de-duplicated by id.
    const osmMarkers = useMemo(() => {
        const byId = new Map();
        // `nearby` now also carries nearby hidden gems (for the side panel's
        // "Near this gem" list) alongside OSM attractions — gems already have
        // their own proper marker via the main gems layer below, so exclude
        // them here or AttractionMarker renders a second, generic pin on top
        // of them (it has no gem-specific icon, just a category fallback).
        [...nearby, ...explorePlaces, ...clickedPlaces, ...searchResults]
            .filter(p => p && p.source !== "database")
            .forEach(p => {
                if (p.id != null && !byId.has(p.id)) byId.set(p.id, p);
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

    const activeFilterCount = (statusFilter ? 1 : 0) + (categoryFilter.length > 0 ? 1 : 0) + (wishlistOnly ? 1 : 0);

    function toggleCategoryFilter(name) {
        setCategoryFilter(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    }

    // Resets every filter/discovery toggle back to the app's defaults
    function clearAllFilters() {
        setStatusFilter(null);
        setCategoryFilter([]);
        setWishlistOnly(false);
        setExploreOn(true);
        setClickExploreOn(false);
    }

    useEffect(() => {
        try {
            if (statusFilter) sessionStorage.setItem(MAP_STATUS_FILTER_KEY, statusFilter);
            else sessionStorage.removeItem(MAP_STATUS_FILTER_KEY);
        } catch {
            // sessionStorage unavailable (private mode) — filters just won't persist
        }
    }, [statusFilter]);

    useEffect(() => {
        try {
            sessionStorage.setItem(MAP_CATEGORY_FILTER_KEY, JSON.stringify(categoryFilter));
        } catch {
            // ignore
        }
    }, [categoryFilter]);

    useEffect(() => {
        try {
            sessionStorage.setItem(MAP_WISHLIST_ONLY_KEY, wishlistOnly ? "1" : "0");
        } catch {
            // ignore
        }
    }, [wishlistOnly]);

    // The "My wishlist" pill is only rendered for a logged-in Traveller, so a
    // restored (or left-over) wishlist filter after signing out would hide every
    // gem with no visible control to switch it back off. Drop it instead.
    useEffect(() => {
        if (!user && wishlistOnly) setWishlistOnly(false);
    }, [user, wishlistOnly]);

    const selectedGemId = selectedGroup && selectedGroup[0] ? selectedGroup[0].id : null;

    return (
        <div className="maps-page">
            {wishlistToast && (
                <div className="hidden-gem-snackbar hidden-gem-snackbar-success" role="status">
                    {wishlistToast}
                </div>
            )}

            <div className="maps-page-header">
                <h1>Interactive Map</h1>
            </div>
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
                <MarkerClusterGroup
                    ref={gemClusterRef}
                    iconCreateFunction={createGemClusterIcon}
                    zoomToBoundsOnClick={true}
                    spiderfyOnMaxZoom={true}
                    showCoverageOnHover={false}
                >
                    {gemMarkers}
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
                <RevealSelectedGem
                    gem={selectedGroup ? selectedGroup[0] : null}
                    clusterRef={gemClusterRef}
                    markerRefs={gemMarkerRefs}
                />
                <SelectedGemHighlight
                    selectedId={selectedGemId}
                    markerRefs={gemMarkerRefs}
                    clusterRef={gemClusterRef}
                />
                </MapContainer>

                {/* Left column: search box always visible, gem panel docked beneath it */}
                <div className="maps-left-stack">
                    <button
                        type="button"
                        className="maps-back-btn"
                        onClick={() => setMapFullscreen(false)}
                    >
                        ← Exit fullscreen
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
                        itinerariesLoading={itinerariesLoading}
                        onAddToItinerary={handleAddToItinerary}
                        onItineraryCreated={(trip) => {
                            if (trip) setItineraries((prev) => [trip, ...prev]);
                        }}
                        wishlistIds={wishlistIds}
                        onToggleWishlist={handleToggleWishlist}
                        reviews={gemReviews}
                        reviewsLoading={gemReviewsLoading}
                        images={activeGemImages}
                        resumeIntent={resumeIntent}
                        onResumeConsumed={clearResumeIntent}
                    />
                </div>

                {/* Right column: title, status, filters */}
                <div className="maps-hero-topbar">
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
                                <div className="maps-filters-group-header">
                                    <span className="maps-filters-group-label">Status</span>
                                    {activeFilterCount > 0 && (
                                        <button
                                            type="button"
                                            className="maps-filters-clear"
                                            onClick={clearAllFilters}
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
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
                                            className={`maps-category-pill ${categoryFilter.length === 0 ? "active" : ""}`}
                                            onClick={() => setCategoryFilter([])}
                                        >
                                            All
                                        </button>
                                        {categories.map((c) => (
                                            <button
                                                type="button"
                                                key={c.id}
                                                className={`maps-category-pill ${categoryFilter.includes(c.name) ? "active" : ""}`}
                                                onClick={() => toggleCategoryFilter(c.name)}
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
                                        <img src="/images/maps/gem_marker.png" alt="" className="maps-legend-icon" />
                                        Hidden gem (verified)
                                    </span>
                                    <span className="maps-legend-item">
                                        <img src="/images/maps/gem_marker.png" alt="" className="maps-legend-icon maps-legend-icon-dim" />
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
