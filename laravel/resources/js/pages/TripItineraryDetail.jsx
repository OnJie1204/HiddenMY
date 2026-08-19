import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";
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
import L from "leaflet";
import "leaflet/dist/leaflet.css";


import "../styles/global.css";

const hiddenGemMarkerIcon = L.divIcon({
    className: "hidden-gem-marker-icon",
    html: '<span class="hidden-gem-marker-diamond" aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

const selectedHiddenGemMarkerIcon = L.divIcon({
    className: "hidden-gem-marker-icon",
    html: '<span class="hidden-gem-marker-diamond hidden-gem-marker-diamond-selected" aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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

const toDisplayLocation = (location) => ({
    id: location.id,
    name: location.location?.place_name ?? location.osm_name ?? `OpenStreetMap location (${location.osm_id})`,
    type: location.isHidden ? "hidden" : "osm",
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

/* dragable location card component */
function SortableLocationCard({

    location,

    index,

    onDelete

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

            <div className="trip-detail-location-name">
                {index + 1}. {location.name}
            </div>

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

    useEffect(() => {
        refreshItinerary().catch((error) => {
            console.error("Failed to load itinerary locations.", error);
        });
    }, [id]);

    useEffect(() => {
        if (!isStoppingPointDialogOpen) return;

        let isCurrent = true;

        const loadHiddenGems = async () => {
            setIsLoadingHiddenGems(true);
            setHiddenGemsError("");

            try {
                const response = await getHiddenGems({ status: "hidden_gem" });
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
        setMapTarget({ ...location, zoom: location.source === "database" ? 16 : 15 });
        setSearchResults({ database: [], openStreetMap: [] });
    };

    const selectHiddenGemOnMap = (hiddenGem) => {
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
            alert("Trip name is required.");
            return;
        }

        if (newName.length < 1) {
            alert("Trip name must be at least 1 character.");
            return;
        }

        if (newName.length > 10) {
            alert("Trip name cannot exceed 10 characters.");
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

            setIsRenaming(false);
        } catch (err) {
            console.error(err);
            alert("Failed to rename itinerary.");
        }
    };



    const handleDelete = async () => {

        if (!window.confirm("Delete this itinerary?")) return;

        try {

            await deleteTripItinerary(id);

            navigate("/trip-itinerary");

        } catch (err) {

            console.error(err);

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

    return (

        <div className="trip-detail-container">


            <button
                className="trip-detail-back-btn"
                onClick={() => navigate("/trip-itinerary")}
            >
                ← Back to My Itineraries
            </button>



            <div className="trip-detail-header">


                <div>

                    {isRenaming ? (

                        <form onSubmit={handleRename}>

                            <input
                                type="text"
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                placeholder="Enter itinerary name"
                                autoFocus
                                className="trip-rename-input"
                            />

                            <div className="trip-rename-buttons">

                                <button
                                    type="submit"
                                    className="trip-detail-btn trip-detail-add-btn"
                                >
                                    Rename
                                </button>

                                <button
                                    type="button"
                                    className="trip-detail-btn trip-detail-cancel-btn"
                                    onClick={() => {
                                        setRenameName(trip.trip_name);
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



                <div>

                    {!isRenaming && (
                        <button
                            className="trip-detail-btn trip-detail-rename-btn"
                            onClick={() => setIsRenaming(true)}
                        >
                            Rename
                        </button>
                    )}


                    <button className="trip-detail-btn trip-detail-delete-btn" onClick={handleDelete}>
                        Delete
                    </button>

                </div>


            </div>





            <hr />



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

                {isSavingLocationOrder && (
                    <p className="trip-location-order-status">Saving stop order…</p>
                )}
                {locationOrderError && (
                    <p className="trip-location-order-status trip-location-order-error" role="alert">
                        {locationOrderError}
                    </p>
                )}

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
                            />

                        ))}

                    </SortableContext>

                </DndContext>

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

                        <div className="stopping-point-wishlist-section">
                            <p className="stopping-point-search-label">From your wishlist</p>
                            {isLoadingWishlist && <p className="stopping-point-search-status">Loading your wishlist…</p>}
                            {!isLoadingWishlist && wishlistItems.length === 0 && (
                                <p className="stopping-point-search-status">
                                    Nothing saved yet — <Link to="/wishlist">browse hidden gems</Link> and tap the heart to save some here.
                                </p>
                            )}
                            {!isLoadingWishlist && wishlistItems.length > 0 && (
                                <div className="stopping-point-search-suggestions" role="listbox" aria-label="Wishlist locations">
                                    {wishlistItems.map((gem) => (
                                        <button
                                            key={`wishlist-${gem.id}`}
                                            type="button"
                                            className="stopping-point-search-result"
                                            onClick={() => selectSearchResult({
                                                id: gem.id,
                                                name: gem.place_name,
                                                source: "database",
                                                status: gem.status,
                                                latitude: gem.latitude,
                                                longitude: gem.longitude,
                                            })}
                                        >
                                            <span className="stopping-point-search-result-name">{gem.place_name}</span>
                                            <span className={`stopping-point-search-result-status ${getGemStatusDisplay(gem).badgeClass}`}>
                                                {getGemStatusDisplay(gem).label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(isSearchingLocations || searchResults.database.length > 0 || searchResults.openStreetMap.length > 0 || locationSearchError) && (
                            <div className="stopping-point-search-suggestions" role="listbox" aria-label="Location search results">
                                {isSearchingLocations && <p className="stopping-point-search-status">Searching locations…</p>}
                                {locationSearchError && <p className="stopping-point-search-status stopping-point-map-status-error" role="alert">{locationSearchError}</p>}

                                {[...searchResults.database, ...searchResults.openStreetMap].map((location) => (
                                    <button
                                        key={`${location.source}-${location.id}`}
                                        type="button"
                                        className="stopping-point-search-result"
                                        onClick={() => selectSearchResult(location)}
                                    >
                                        <span className="stopping-point-search-result-name">{location.name}</span>
                                        {location.source === "database" && (
                                            <span className={`stopping-point-search-result-status ${getGemStatusDisplay(location).badgeClass}`}>
                                                {getGemStatusDisplay(location).label}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        <p className="stopping-point-search-status">
                            Or click anywhere on the map to select that location.
                        </p>

                        <div className="stopping-point-map" aria-label="Map of hidden gems">
                            <MapContainer
                                center={[4.2105, 101.9758]}
                                zoom={6}
                                scrollWheelZoom
                                className="stopping-point-leaflet-map"
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <MapViewController target={mapTarget} />
                                <MapClickHandler onMapClick={handleMapClick} />
                                {hiddenGems
                                    .filter(hasValidCoordinates)
                                    .map((hiddenGem) => (
                                        <Marker
                                            key={hiddenGem.id}
                                            position={[Number(hiddenGem.latitude), Number(hiddenGem.longitude)]}
                                            icon={selectedLocation?.source === "database" && String(selectedLocation.id) === String(hiddenGem.id)
                                                ? selectedHiddenGemMarkerIcon
                                                : hiddenGemMarkerIcon}
                                            eventHandlers={{
                                                click: () => selectHiddenGemOnMap(hiddenGem),
                                            }}
                                        >
                                            <Popup>
                                                <div className="hidden-gem-marker-popup">
                                                    <strong>{hiddenGem.place_name}</strong>
                                                    <span>
                                                        {Number(hiddenGem.latitude).toFixed(6)}, {Number(hiddenGem.longitude).toFixed(6)}
                                                    </span>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    ))}
                                {selectedLocation?.source === "openstreetmap" && hasValidCoordinates(selectedLocation) && (
                                    <Marker
                                        position={[Number(selectedLocation.latitude), Number(selectedLocation.longitude)]}
                                        icon={openStreetMapMarkerIcon}
                                    >
                                        <Popup>
                                            <div className="hidden-gem-marker-popup">
                                                <strong>{selectedLocation.name}</strong>
                                                <span>
                                                    {Number(selectedLocation.latitude).toFixed(6)}, {Number(selectedLocation.longitude).toFixed(6)}
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

                        {selectedLocation && (
                            <p className="stopping-point-selected-location">
                                Selected: {selectedLocation.name}
                            </p>
                        )}

                        {isLoadingHiddenGems && (
                            <p className="stopping-point-map-status">Loading hidden gems…</p>
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
