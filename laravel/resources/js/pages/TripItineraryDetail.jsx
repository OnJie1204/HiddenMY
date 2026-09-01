import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import {
    addTripLocation,
    deleteTripItinerary,
    deleteTripLocation,
    getTripItinerary,
    updateTripItinerary,
    updateTripLocationOrder,
} from "../api/TripItinerary";
import { getHiddenGems, searchHiddenGems, reverseGeocodeLocation } from "../api/hiddenGems";
import { getWishlist } from "../api/wishlist";
import { getGemStatusDisplay } from "../utils/gemStatus";

import {
    DndContext,
    closestCenter
} from "@dnd-kit/core";

import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { MdDragIndicator } from "react-icons/md";
import { MapContainer, Marker, Popup, Tooltip, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createGemClusterIcon } from "../components/GemClusterIcon";
import Spinner from "../components/Spinner";


import "../styles/global.css";

const hiddenGemMarkerIcon = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -20],
});

// Dimmed variant for AI-approved gems still awaiting community votes, so
// Hidden Gem vs. awaiting-votes is visible at a glance on the map itself.
const hiddenGemMarkerIconPending = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -20],
    className: "hidden-gem-marker-pending",
});

const openStreetMapMarkerIcon = L.divIcon({
    className: "open-street-map-marker-icon",
    html: '<span class="open-street-map-marker" aria-hidden="true"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

const userLocationMarkerIcon = L.divIcon({
    className: "user-location-marker-icon",
    html: '<span class="user-location-marker-pulse" aria-hidden="true"></span><span class="user-location-marker-dot" aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

const hasValidCoordinates = ({ latitude, longitude }) =>
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

// How far the map zooms in on a selected hidden gem (from the wishlist,
// search results, or a direct map click) — the zoom-in itself is the
// "focus" effect, so it needs to be tight enough to clearly separate the
// selected pin from any neighbours.
const HIDDEN_GEM_FOCUS_ZOOM = 18;

// Approximate latitude/longitude boundaries of Malaysia — the stopping-point
// map is locked to this area so users can only pick locations within Malaysia.
// Loose rectangle used only to keep the map panned around Malaysia. It is not
// a precise border — the actual "is this in Malaysia?" check is done against
// the resolved address (see handleMapClick / the reverse-geocode endpoint).
const MALAYSIA_BOUNDS = [
    [0.5, 99.5],
    [7.5, 119.5],
];

const toDisplayLocation = (location) => ({
    id: location.id,
    name: location.location?.place_name ?? location.osm_name ?? `OpenStreetMap location (${location.osm_id})`,
    type: location.isHidden ? "hidden" : "osm",
    // The underlying Hidden Gem (Location) id, so a hidden-gem stop can link
    // straight to its detail page. Null for OpenStreetMap stops.
    gemId: location.isHidden ? location.location?.id ?? null : null,
    latitude: location.isHidden ? location.location?.latitude : location.latitude,
    longitude: location.isHidden ? location.location?.longitude : location.longitude,
});

function MapViewController({ target }) {
    const map = useMap();

    useEffect(() => {
        if (target && hasValidCoordinates(target)) {
            map.flyTo([Number(target.latitude), Number(target.longitude)], target.zoom, {
                duration: 0.5,
            });
        }
    }, [map, target]);

    return null;
}

function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(event) {
            onMapClick(event.latlng);
        },
    });

    return null;
}

// Applies the "selected" highlight directly to a marker's DOM element
// (rather than via the `icon` prop, which would disturb MarkerClusterGroup's
// grouping — see hiddenGemMarkers above). Also re-applies on zoom/pan, since
// a clustered marker has no DOM element until it's individually visible,
// which can happen asynchronously after flying to a freshly selected gem.
// This is the only thing it does — it must stay side-effect-free for
// direct map-click selection, which already works correctly on its own
// (Leaflet opens that marker's popup natively) and must not be disturbed.
function ClusterHighlightSync({ selectedId, markerRefs }) {
    const applyHighlight = () => {
        Object.entries(markerRefs.current).forEach(([id, marker]) => {
            const element = marker?.getElement?.();
            if (!element) return;

            element.classList.toggle("hidden-gem-marker-selected", id === selectedId);
        });
    };

    useEffect(() => {
        applyHighlight();
    }, [selectedId]);

    useMapEvents({
        zoomend: applyHighlight,
        moveend: applyHighlight,
    });

    return null;
}

/* dragable location card component */
function SortableLocationCard({

    location,

    index,

    onDelete,

    onOpen

}) {

    const {

        attributes,

        listeners,

        setNodeRef,

        transform,

        transition

    } = useSortable({

        id: location.id

    });

    const style = {

        transform: CSS.Transform.toString(transform),

        transition

    };

    return (

        <div

            ref={setNodeRef}

            style={style}

            className="trip-detail-location-card"

        >

            <div

                className="trip-detail-drag-handle"

                {...attributes}

                {...listeners}

            >

                <MdDragIndicator size={22} />

            </div>

            <button
                type="button"
                className="trip-detail-location-name"
                onClick={() => onOpen(location)}
                title={location.type === "hidden"
                    ? "View hidden gem details"
                    : "Search for this location on Google"}
            >
                {index + 1}. {location.name}
            </button>

            <button

                className="trip-detail-delete-stop-btn"

                onClick={() => onDelete(location.id)}
                aria-label="Remove stop"
                title="Remove stop"

            >

                ✕

            </button>

        </div>

    );

}




export default function TripItineraryDetail() {
    const navigate = useNavigate();

    const { id } = useParams();

    const { state } = useLocation();

    const [trip, setTrip] = useState(
        state?.itinerary || null
    );

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameName, setRenameName] = useState("");
    const [renameError, setRenameError] = useState("");
    const [isStoppingPointDialogOpen, setIsStoppingPointDialogOpen] = useState(false);
    const [hiddenGems, setHiddenGems] = useState([]);
    const [isLoadingHiddenGems, setIsLoadingHiddenGems] = useState(false);
    const [hiddenGemsError, setHiddenGemsError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState({ database: [], openStreetMap: [] });
    const [isSearchingLocations, setIsSearchingLocations] = useState(false);
    const [locationSearchError, setLocationSearchError] = useState("");
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [mapTarget, setMapTarget] = useState(null);
    const [isAddingLocation, setIsAddingLocation] = useState(false);
    const [addLocationError, setAddLocationError] = useState("");
    const [isSavingLocationOrder, setIsSavingLocationOrder] = useState(false);
    const [locationOrderError, setLocationOrderError] = useState("");
    const [routeError, setRouteError] = useState("");
    const [isLocationPromptOpen, setIsLocationPromptOpen] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [isRequestingLocation, setIsRequestingLocation] = useState(false);
    const [locationPromptError, setLocationPromptError] = useState("");
    const [isIdentifyingClickedLocation, setIsIdentifyingClickedLocation] = useState(false);
    const [mapClickError, setMapClickError] = useState("");
    const [wishlistItems, setWishlistItems] = useState([]);
    const [isLoadingWishlist, setIsLoadingWishlist] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeletingTrip, setIsDeletingTrip] = useState(false);
    const [isLoadingItinerary, setIsLoadingItinerary] = useState(true);

    const closeStoppingPointDialog = () => {
        setIsStoppingPointDialogOpen(false);
        setSelectedLocation(null);
        setSearchQuery("");
        setSearchResults({ database: [], openStreetMap: [] });
        setMapTarget(null);
        setAddLocationError("");
        setUserLocation(null);
        setMapClickError("");
    };

    const openAddStoppingPointFlow = () => {
        setLocationPromptError("");

        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setUserLocation(null);
            setIsStoppingPointDialogOpen(true);
            return;
        }

        setIsLocationPromptOpen(true);
    };

    const skipLocationAndOpenDialog = () => {
        setUserLocation(null);
        setIsRequestingLocation(false);
        setIsLocationPromptOpen(false);
        setIsStoppingPointDialogOpen(true);
    };

    const shareLocationAndOpenDialog = () => {
        setIsRequestingLocation(true);
        setLocationPromptError("");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                };
                setUserLocation(location);
                setMapTarget({ ...location, zoom: 13 });
                setIsRequestingLocation(false);
                setIsLocationPromptOpen(false);
                setIsStoppingPointDialogOpen(true);
            },
            (error) => {
                console.error("Failed to get user location.", error);
                setIsRequestingLocation(false);
                setLocationPromptError("Unable to access your location. You can skip and search without it.");
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
    };

    const refreshItinerary = async () => {
        const response = await getTripItinerary(id);
        const itinerary = response.data?.data;

        if (itinerary) {
            setTrip(itinerary);
            setLocations(Array.isArray(itinerary.locations) ? itinerary.locations.map(toDisplayLocation) : []);
        }
    };

    useEffect(() => {
        if (trip) {
            setRenameName(trip.trip_name);
        }
    }, [trip]);

    // Once a valid location is picked — from the map, a search result, or the
    // wishlist — clear any lingering selection error so it doesn't sit next to
    // a perfectly good choice.
    useEffect(() => {
        if (selectedLocation) {
            setMapClickError("");
            setAddLocationError("");
            setLocationSearchError("");
        }
    }, [selectedLocation]);

    useEffect(() => {
        setIsLoadingItinerary(true);
        refreshItinerary()
            .catch((error) => {
                console.error("Failed to load itinerary locations.", error);
            })
            .finally(() => {
                setIsLoadingItinerary(false);
            });
    }, [id]);

    useEffect(() => {
        if (!isStoppingPointDialogOpen) return;

        let isCurrent = true;

        const loadHiddenGems = async () => {
            setIsLoadingHiddenGems(true);
            setHiddenGemsError("");

            try {
                const response = await getHiddenGems({ per_page: 500 });
                const gems = Array.isArray(response.data?.data) ? response.data.data : [];

                if (isCurrent) {
                    setHiddenGems(gems);
                }
            } catch (error) {
                console.error("Failed to load hidden gems.", error);

                if (isCurrent) {
                    setHiddenGems([]);
                    setHiddenGemsError("Unable to load hidden gems. Please try again.");
                }
            } finally {
                if (isCurrent) {
                    setIsLoadingHiddenGems(false);
                }
            }
        };

        loadHiddenGems();

        return () => {
            isCurrent = false;
        };
    }, [isStoppingPointDialogOpen]);

    useEffect(() => {
        if (!isStoppingPointDialogOpen) return;

        let isCurrent = true;

        setIsLoadingWishlist(true);
        getWishlist()
            .then((response) => {
                if (isCurrent) {
                    setWishlistItems(Array.isArray(response.data?.data) ? response.data.data : []);
                }
            })
            .catch((error) => {
                console.error("Failed to load wishlist.", error);
                if (isCurrent) setWishlistItems([]);
            })
            .finally(() => {
                if (isCurrent) setIsLoadingWishlist(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [isStoppingPointDialogOpen]);

    useEffect(() => {
        if (!isStoppingPointDialogOpen) return;

        const query = searchQuery.trim();

        if (!query) {
            setSearchResults({ database: [], openStreetMap: [] });
            setLocationSearchError("");
            setIsSearchingLocations(false);

            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(async () => {
            setIsSearchingLocations(true);
            setLocationSearchError("");

            try {
                const response = await searchHiddenGems(query, {
                    signal: controller.signal,
                    latitude: userLocation?.latitude,
                    longitude: userLocation?.longitude,
                });
                setSearchResults({
                    database: Array.isArray(response.data?.database) ? response.data.database : [],
                    openStreetMap: Array.isArray(response.data?.openStreetMap) ? response.data.openStreetMap : [],
                });
            } catch (error) {
                if (error.code !== "ERR_CANCELED") {
                    console.error("Failed to search locations.", error);
                    setSearchResults({ database: [], openStreetMap: [] });
                    setLocationSearchError("Unable to search locations. Please try again.");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearchingLocations(false);
                }
            }
        }, 300);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [isStoppingPointDialogOpen, searchQuery, userLocation]);

    const selectSearchResult = (location) => {
        setSelectedLocation(location);

        if (location.source === "database") {
            // A wishlist/search pick never generates a native marker click,
            // so Leaflet never opens a popup for it on its own — do it here.
            // zoomToShowLayer is used (rather than a plain flyTo) because it
            // reliably zooms in *and* spiderfies through the marker's
            // cluster as needed before calling back, which a fixed zoom
            // level can't guarantee when gems sit very close together.
            const marker = hiddenGemMarkerRefs.current[String(location.id)];
            const clusterGroup = hiddenGemClusterRef.current;

            if (marker && clusterGroup) {
                clusterGroup.zoomToShowLayer(marker, () => {
                    marker.openPopup();
                });
                return;
            }

            setMapTarget({ ...location, zoom: HIDDEN_GEM_FOCUS_ZOOM });
            return;
        }

        setMapTarget({ ...location, zoom: 15 });
    };

    const selectHiddenGemOnMap = (hiddenGem) => {
        // No flyTo here: the marker is already visible on screen (that's how
        // it got clicked), and animating a zoom at the same moment Leaflet
        // opens the marker's popup fights MarkerClusterGroup's regrouping,
        // which closes the popup right back up. The zoom-in "focus" effect
        // is for search/wishlist picks (see selectSearchResult), which
        // don't already have the marker in view.
        setSelectedLocation({ ...hiddenGem, name: hiddenGem.place_name, source: "database" });
    };

    const handleMapClick = async (latlng) => {
        const latitude = latlng.lat;
        const longitude = latlng.lng;

        setSelectedLocation(null);
        setMapClickError("");
        setIsIdentifyingClickedLocation(true);

        try {
            const response = await reverseGeocodeLocation(latitude, longitude);
            const location = {
                id: response.data.id,
                osm_id: response.data.osm_id,
                name: response.data.name,
                latitude,
                longitude,
                source: "openstreetmap",
            };

            setSelectedLocation(location);
            setMapTarget({ ...location, zoom: 16 });
        } catch (error) {
            console.error("Failed to identify the clicked location.", error);
            setMapClickError(
                error.response?.data?.message ?? "Unable to identify a location at this point. Please try again.",
            );
        } finally {
            setIsIdentifyingClickedLocation(false);
        }
    };

    const handleAddLocation = async () => {
        if (!selectedLocation || isAddingLocation) return;

        const data = selectedLocation.source === "database"
            ? { source: "database", location_id: selectedLocation.id }
            : {
                source: "openstreetmap",
                osm_id: selectedLocation.osm_id,
                osm_name: selectedLocation.name,
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
            };

        setIsAddingLocation(true);
        setAddLocationError("");

        try {
            await addTripLocation(id, data);
            await refreshItinerary();
            closeStoppingPointDialog();
        } catch (error) {
            console.error("Failed to add stopping point.", error);
            setAddLocationError(error.response?.data?.message ?? "Unable to add this stopping point. Please try again.");
        } finally {
            setIsAddingLocation(false);
        }
    };

    const createdDate = trip?.created_at
        ? new Date(trip.created_at).toLocaleDateString(
            "en-GB",
            {
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        )
        : "";

    const [locations, setLocations] = useState([]);

    const handleDragEnd = async (event) => {

        const {

            active,

            over

        } = event;

        if (!over) return;

        if (active.id !== over.id) {

            const oldIndex = locations.findIndex(item => item.id === active.id);
            const newIndex = locations.findIndex(item => item.id === over.id);
            const reorderedLocations = arrayMove(locations, oldIndex, newIndex);

            setLocations(reorderedLocations);
            setIsSavingLocationOrder(true);
            setLocationOrderError("");

            try {
                const response = await updateTripLocationOrder(
                    id,
                    reorderedLocations.map((location, index) => ({
                        id: location.id,
                        sequence: index + 1,
                    })),
                );

                const savedLocations = response.data?.data?.locations;

                if (Array.isArray(savedLocations)) {
                    setLocations(savedLocations.map(toDisplayLocation));
                }
            } catch (error) {
                console.error("Failed to save stopping point order.", error);
                setLocationOrderError("Unable to save the new stop order. The saved order has been restored.");
                refreshItinerary().catch((refreshError) => {
                    console.error("Failed to restore stopping point order.", refreshError);
                });
            } finally {
                setIsSavingLocationOrder(false);
            }

        }

    };



    const handleRename = async (e) => {
        e.preventDefault();

        const newName = renameName.trim();

        if (!newName) {
            setRenameError("Trip name is required.");
            return;
        }

        if (newName.length > 10) {
            setRenameError("Trip name cannot exceed 10 characters.");
            return;
        }

        try {
            await updateTripItinerary(id, {
                trip_name: newName
            });

            setTrip({
                ...trip,
                trip_name: newName
            });

            setRenameError("");
            setIsRenaming(false);
        } catch (err) {
            console.error(err);
            setRenameError(err?.response?.data?.message || "Failed to rename itinerary. Please try again.");
        }
    };



    const handleDelete = async () => {

        setIsDeletingTrip(true);

        try {

            await deleteTripItinerary(id);

            navigate("/trip-itinerary");

        } catch (err) {

            console.error(err);
            setIsDeletingTrip(false);

        }

    };



    const removeLocation = async (locationId) => {

        const previousLocations = locations;

        setLocations(
            locations.filter(
                item => item.id !== locationId
            )
        );
        setLocationOrderError("");

        try {
            await deleteTripLocation(id, locationId);
        } catch (error) {
            console.error("Failed to delete stopping point.", error);
            setLocations(previousLocations);
            setLocationOrderError("Unable to delete this stopping point. Please try again.");
        }

    };



    // Clicking a stop opens its details: hidden gems go to their in-app
    // detail page; OpenStreetMap stops (which have no in-app page) open a
    // Google search for the place name so the user can still look it up.
    const handleOpenLocation = (location) => {
        if (location.type === "hidden" && location.gemId) {
            navigate(`/hidden-gems/${location.gemId}`);
            return;
        }

        window.open(
            `https://www.google.com/search?q=${encodeURIComponent(location.name)}`,
            "_blank",
            "noopener,noreferrer",
        );
    };

    const handleOpenRouteInGoogleMaps = () => {
        const stopsWithCoordinates = locations.filter(hasValidCoordinates);

        if (stopsWithCoordinates.length === 0) {
            setRouteError("Add at least one stopping point with known coordinates before opening the route.");
            return;
        }

        setRouteError("");

        const destinationStop = stopsWithCoordinates[stopsWithCoordinates.length - 1];
        const waypointStops = stopsWithCoordinates.slice(0, -1);

        const params = new URLSearchParams({
            api: "1",
            destination: `${Number(destinationStop.latitude)},${Number(destinationStop.longitude)}`,
            travelmode: "driving",
        });

        if (waypointStops.length > 0) {
            params.set(
                "waypoints",
                waypointStops.map((stop) => `${Number(stop.latitude)},${Number(stop.longitude)}`).join("|"),
            );
        }

        window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
    };

    // Marker instances keyed by gem id, so the selected one can be
    // highlighted imperatively (see the effect below) without touching the
    // `icon` prop — changing `icon` forces MarkerClusterGroup to re-cluster
    // everything and silently close any open popup.
    const hiddenGemMarkerRefs = useRef({});

    // The underlying L.MarkerClusterGroup instance, so a wishlist/search
    // pick can call zoomToShowLayer() — the only reliable way to reveal a
    // marker (zooming and spiderfying as needed) when it's still clustered
    // together with other gems even after zooming in.
    const hiddenGemClusterRef = useRef(null);

    // Memoized so the marker elements only change when hiddenGems itself
    // changes — otherwise every unrelated re-render (e.g. selecting a
    // location) hands MarkerClusterGroup a brand-new children array, which
    // makes it re-cluster everything and silently close any open popup.
    const hiddenGemMarkers = useMemo(() => (
        hiddenGems
            .filter(hasValidCoordinates)
            .map((hiddenGem) => (
                <Marker
                    key={hiddenGem.id}
                    ref={(instance) => {
                        if (instance) {
                            hiddenGemMarkerRefs.current[hiddenGem.id] = instance;
                        } else {
                            delete hiddenGemMarkerRefs.current[hiddenGem.id];
                        }
                    }}
                    position={[Number(hiddenGem.latitude), Number(hiddenGem.longitude)]}
                    icon={hiddenGem.status === "pending_community_vote"
                        ? hiddenGemMarkerIconPending
                        : hiddenGemMarkerIcon}
                    eventHandlers={{
                        click: () => selectHiddenGemOnMap(hiddenGem),
                    }}
                >
                    <Popup>
                        <div className="hidden-gem-marker-popup">
                            <strong>{hiddenGem.place_name}</strong>
                            <span>
                                {hiddenGem.category?.name || "Uncategorized"}
                                {hiddenGem.status === "pending_community_vote" && " · Awaiting votes"}
                            </span>
                        </div>
                    </Popup>
                </Marker>
            ))
    ), [hiddenGems]);

    const selectedHiddenGemId = selectedLocation?.source === "database" ? String(selectedLocation.id) : null;

    return (

        <div className="trip-detail-container">

            {isLoadingItinerary && (
                <div
                    className="trip-detail-loading-bar"
                    role="progressbar"
                    aria-label="Loading itinerary"
                >
                    <div className="trip-detail-loading-bar-indicator" />
                </div>
            )}

            <div className="trip-detail-header">


                <div>

                    {isRenaming ? (

                        <form onSubmit={handleRename} noValidate>

                            <input
                                type="text"
                                value={renameName}
                                onChange={(e) => {
                                    setRenameName(e.target.value);
                                    if (renameError) setRenameError("");
                                }}
                                placeholder="Enter itinerary name"
                                autoFocus
                                className={`trip-rename-input${renameError ? " trip-input-error" : ""}`}
                                aria-invalid={renameError ? "true" : "false"}
                                aria-describedby={renameError ? "trip-rename-error" : undefined}
                            />

                            {renameError && (
                                <p id="trip-rename-error" className="trip-name-error" role="alert">
                                    {renameError}
                                </p>
                            )}

                            <div className="trip-rename-buttons">

                                <button
                                    type="submit"
                                    className="trip-detail-btn trip-detail-add-btn trip-detail-header-btn"
                                >
                                    Rename
                                </button>

                                <button
                                    type="button"
                                    className="trip-detail-btn trip-detail-cancel-btn"
                                    onClick={() => {
                                        setRenameName(trip.trip_name);
                                        setRenameError("");
                                        setIsRenaming(false);
                                    }}
                                >
                                    Cancel
                                </button>

                            </div>

                        </form>

                    ) : (

                        <>
                            <h1>{trip?.trip_name}</h1>

                            <p className="trip-detail-created-date">
                                Created on {createdDate}
                            </p>
                        </>

                    )}

                </div>



                <div className="trip-detail-header-actions">

                    {!isRenaming && (
                        <button
                            className="trip-detail-btn trip-detail-rename-btn"
                            onClick={() => setIsRenaming(true)}
                        >
                            Rename
                        </button>
                    )}

                    {!isRenaming && (
                        <button
                            className="trip-detail-btn trip-detail-add-btn trip-detail-header-btn"
                            onClick={() => navigate(`/travel-posts/create?trip=${trip.id}`)}
                        >
                            Write a Post
                        </button>
                    )}


                    <button
                        className="trip-detail-btn trip-detail-delete-btn"
                        onClick={() => setIsConfirmingDelete(true)}
                    >
                        Delete
                    </button>

                </div>


            </div>

            {isConfirmingDelete && (
                <div
                    className="delete-modal-overlay"
                    onClick={() => !isDeletingTrip && setIsConfirmingDelete(false)}
                >
                    <div className="delete-modal" onClick={(event) => event.stopPropagation()}>
                        <h2>Delete Itinerary?</h2>
                        <p>Are you sure you want to delete this trip itinerary? This action cannot be undone.</p>
                        <div className="delete-modal-actions">
                            <button
                                className="delete-modal-cancel"
                                onClick={() => setIsConfirmingDelete(false)}
                                disabled={isDeletingTrip}
                            >
                                Cancel
                            </button>
                            <button
                                className="delete-modal-confirm"
                                onClick={handleDelete}
                                disabled={isDeletingTrip}
                            >
                                {isDeletingTrip ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="trip-detail-content-panel">

            {isSavingLocationOrder && (
                <div
                    className="trip-detail-loading-bar trip-detail-loading-bar-panel"
                    role="progressbar"
                    aria-label="Saving stop order"
                >
                    <div className="trip-detail-loading-bar-indicator" />
                </div>
            )}

            <div className="trip-detail-section-header">

                <h2>Trip Stops</h2>

                <span>
                    {locations.length} Stops
                </span>

            </div>



            <div className="add-buttons">


                <button
                    type="button"
                    className="trip-detail-btn trip-detail-add-btn"
                    onClick={openAddStoppingPointFlow}
                >
                    + Add Stopping Point
                </button>


            </div>





            <div className="location-list">

                {locationOrderError && (
                    <p className="trip-location-order-status trip-location-order-error" role="alert">
                        {locationOrderError}
                    </p>
                )}

                {isLoadingItinerary && locations.length === 0 ? (

                    <>
                        <div className="trip-detail-location-card trip-detail-location-card-skeleton" />
                        <div className="trip-detail-location-card trip-detail-location-card-skeleton" />
                        <div className="trip-detail-location-card trip-detail-location-card-skeleton" />
                    </>

                ) : locations.length === 0 ? (

                    <div className="trip-detail-empty-stops">
                        <p>No stops added yet. Use “+ Add Stopping Point” above to start building this itinerary.</p>
                    </div>

                ) : (

                    <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >

                        <SortableContext
                            items={locations}
                            strategy={verticalListSortingStrategy}
                        >

                            {locations.map((location, index) => (

                                <SortableLocationCard
                                    key={location.id}
                                    location={location}
                                    index={index}
                                    onDelete={removeLocation}
                                    onOpen={handleOpenLocation}
                                />

                            ))}

                        </SortableContext>

                    </DndContext>

                )}

            </div>

            </div>



            {isLocationPromptOpen && (
                <div
                    className="stopping-point-dialog-backdrop"
                    onMouseDown={() => setIsLocationPromptOpen(false)}
                >
                    <section
                        className="stopping-point-dialog location-prompt-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="location-prompt-dialog-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <h2 id="location-prompt-dialog-title">Use your current location?</h2>

                        <p className="location-prompt-description">
                            Sharing your location lets us show nearby OpenStreetMap results first. This is
                            optional — Hidden Gems are always searched first either way.
                        </p>

                        {locationPromptError && (
                            <p className="stopping-point-map-status stopping-point-map-status-error" role="alert">
                                {locationPromptError}
                            </p>
                        )}

                        <div className="stopping-point-dialog-actions">
                            <button
                                type="button"
                                className="stopping-point-cancel-btn"
                                onClick={skipLocationAndOpenDialog}
                                disabled={isRequestingLocation}
                            >
                                Skip
                            </button>
                            <button
                                type="button"
                                className="stopping-point-confirm-btn"
                                onClick={shareLocationAndOpenDialog}
                                disabled={isRequestingLocation}
                            >
                                {isRequestingLocation ? "Requesting…" : "Share Location"}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {isStoppingPointDialogOpen && (
                <div
                    className="stopping-point-dialog-backdrop"
                    onMouseDown={closeStoppingPointDialog}
                >
                    <section
                        className="stopping-point-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stopping-point-dialog-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <h2 id="stopping-point-dialog-title">Add Stopping Point</h2>

                        {userLocation && (
                            <p className="stopping-point-search-status">
                                Showing OpenStreetMap results nearest to your current location first.
                            </p>
                        )}

                        <label className="stopping-point-search-label" htmlFor="stopping-point-search">
                            Search hidden gems
                        </label>
                        <input
                            id="stopping-point-search"
                            type="search"
                            className="stopping-point-search"
                            placeholder="Search by name"
                            autoComplete="off"
                            value={searchQuery}
                            onChange={(event) => {
                                setSearchQuery(event.target.value);
                                setSelectedLocation(null);
                            }}
                        />

                        <p className="stopping-point-search-status stopping-point-map-hint">
                            Or click anywhere on the map to select that location.
                        </p>

                        <div className="stopping-point-body">

                            <div className="stopping-point-list">

                                <div className="stopping-point-list-section">

                                    <div className="stopping-point-list-header">From your wishlist</div>

                                    <div className="stopping-point-list-items">

                                        {isLoadingWishlist && (
                                            <Spinner size="sm" inline label="Loading your wishlist…" />
                                        )}

                                        {!isLoadingWishlist && wishlistItems.length === 0 && (
                                            <p className="stopping-point-list-status">
                                                Nothing saved yet — <Link to="/wishlist">browse hidden gems</Link> and tap the heart to save some here.
                                            </p>
                                        )}

                                        {!isLoadingWishlist && wishlistItems.length > 0 && wishlistItems.map((gem, index) => (
                                            <button
                                                key={`wishlist-${gem.id}`}
                                                type="button"
                                                className={`stopping-point-item ${selectedLocation?.source === "database" && String(selectedLocation.id) === String(gem.id) ? "selected" : ""}`}
                                                onClick={() => selectSearchResult({
                                                    id: gem.id,
                                                    name: gem.place_name,
                                                    source: "database",
                                                    status: gem.status,
                                                    latitude: gem.latitude,
                                                    longitude: gem.longitude,
                                                })}
                                            >
                                                <span className="stopping-point-item-rank">{index + 1}.</span>
                                                <span className="stopping-point-item-content">
                                                    <span className="stopping-point-item-top">
                                                        <span className="stopping-point-item-name">{gem.place_name}</span>
                                                        <span className={`stopping-point-search-result-status ${getGemStatusDisplay(gem).badgeClass}`}>
                                                            {getGemStatusDisplay(gem).label}
                                                        </span>
                                                    </span>
                                                    <span className="stopping-point-item-category">{gem.category?.name || "Uncategorized"}</span>
                                                    <span className="stopping-point-item-state">{gem.state || "Unknown"}</span>
                                                </span>
                                            </button>
                                        ))}

                                    </div>

                                </div>

                                <div className="stopping-point-list-section">

                                    <div className="stopping-point-list-header">Search Results</div>

                                    <div className="stopping-point-list-items">

                                        {!searchQuery.trim() && !isSearchingLocations && (
                                            <p className="stopping-point-list-status">
                                                Start typing above to search for a location.
                                            </p>
                                        )}

                                        {isSearchingLocations && (
                                            <Spinner size="sm" inline label="Searching locations…" />
                                        )}

                                        {locationSearchError && (
                                            <p className="stopping-point-list-status stopping-point-map-status-error" role="alert">
                                                {locationSearchError}
                                            </p>
                                        )}

                                        {!isSearchingLocations && !locationSearchError && searchQuery.trim()
                                            && searchResults.database.length === 0 && searchResults.openStreetMap.length === 0 && (
                                            <p className="stopping-point-list-status">
                                                No locations found for "{searchQuery.trim()}".
                                            </p>
                                        )}

                                        {[...searchResults.database, ...searchResults.openStreetMap].map((location, index) => (
                                            <button
                                                key={`${location.source}-${location.id}`}
                                                type="button"
                                                className={`stopping-point-item ${selectedLocation && selectedLocation.source === location.source && String(selectedLocation.id) === String(location.id) ? "selected" : ""}`}
                                                onClick={() => selectSearchResult(location)}
                                            >
                                                <span className="stopping-point-item-rank">{index + 1}.</span>
                                                <span className="stopping-point-item-content">
                                                    <span className="stopping-point-item-top">
                                                        <span className="stopping-point-item-name">{location.name}</span>
                                                        {location.source === "database" && (
                                                            <span className={`stopping-point-search-result-status ${getGemStatusDisplay(location).badgeClass}`}>
                                                                {getGemStatusDisplay(location).label}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {location.state && (
                                                        <span className="stopping-point-item-state">{location.state}</span>
                                                    )}
                                                </span>
                                            </button>
                                        ))}

                                    </div>

                                </div>

                            </div>

                        <div className="stopping-point-map-panel" aria-label="Map of hidden gems">
                            <MapContainer
                                center={[4.2105, 101.9758]}
                                zoom={6}
                                minZoom={6}
                                maxBounds={MALAYSIA_BOUNDS}
                                maxBoundsViscosity={1.0}
                                scrollWheelZoom
                                className="stopping-point-leaflet-map"
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <MapViewController target={mapTarget} />
                                <MapClickHandler onMapClick={handleMapClick} />
                                <ClusterHighlightSync selectedId={selectedHiddenGemId} markerRefs={hiddenGemMarkerRefs} />
                                <MarkerClusterGroup
                                    ref={hiddenGemClusterRef}
                                    iconCreateFunction={createGemClusterIcon}
                                    zoomToBoundsOnClick={true}
                                    spiderfyOnMaxZoom={true}
                                    showCoverageOnHover={false}
                                >
                                    {hiddenGemMarkers}
                                </MarkerClusterGroup>
                                {selectedLocation?.source === "openstreetmap" && hasValidCoordinates(selectedLocation) && (
                                    <Marker
                                        position={[Number(selectedLocation.latitude), Number(selectedLocation.longitude)]}
                                        icon={openStreetMapMarkerIcon}
                                    >
                                        <Popup>
                                            <div className="hidden-gem-marker-popup">
                                                <strong>{selectedLocation.name}</strong>
                                                <span>
                                                    OpenStreetMap Location
                                                </span>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                                {userLocation && hasValidCoordinates(userLocation) && (
                                    <Marker
                                        position={[Number(userLocation.latitude), Number(userLocation.longitude)]}
                                        icon={userLocationMarkerIcon}
                                    >
                                        <Tooltip>Your current location</Tooltip>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>

                        </div>

                        {selectedLocation && (
                            <p className="stopping-point-selected-location">
                                Selected: {selectedLocation.name}
                            </p>
                        )}

                        {isLoadingHiddenGems && (
                            <Spinner size="sm" inline label="Loading hidden gems…" />
                        )}
                        {hiddenGemsError && (
                            <p className="stopping-point-map-status stopping-point-map-status-error" role="alert">
                                {hiddenGemsError}
                            </p>
                        )}
                        {isIdentifyingClickedLocation && (
                            <p className="stopping-point-map-status">Identifying selected location…</p>
                        )}
                        {mapClickError && (
                            <p className="stopping-point-map-status stopping-point-map-status-error" role="alert">
                                {mapClickError}
                            </p>
                        )}
                        {addLocationError && (
                            <p className="stopping-point-map-status stopping-point-map-status-error" role="alert">
                                {addLocationError}
                            </p>
                        )}

                        <div className="stopping-point-dialog-actions">
                            <button
                                type="button"
                                className="stopping-point-cancel-btn"
                                onClick={closeStoppingPointDialog}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="stopping-point-confirm-btn"
                                onClick={handleAddLocation}
                                disabled={!selectedLocation || isAddingLocation}
                            >
                                {isAddingLocation ? "Adding…" : "Add"}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {routeError && (
                <p className="trip-location-order-status trip-location-order-error" role="alert">
                    {routeError}
                </p>
            )}

            <button
                className="trip-detail-btn trip-detail-route-btn"
                onClick={handleOpenRouteInGoogleMaps}
            >
                Open Route in Google Maps
            </button>



        </div>

    );

}
