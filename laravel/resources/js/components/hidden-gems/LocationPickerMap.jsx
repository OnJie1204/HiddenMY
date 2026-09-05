import { useEffect, useState } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    ZoomControl,
    useMap,
    useMapEvents
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { cartoTileUrl } from "@/utils/maps/cartoTiles";

import { reverseGeocodeAddress } from "@/features/hidden-gems/api";

const customIcon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

const MALAYSIA_CENTER = [4.2105, 101.9758];

const MALAYSIA_BOUNDS = [
    [0.5, 99.5],
    [7.5, 119.5],
];

const FLY_TO_OPTIONS = {
    duration: 1.1,
    easeLinearity: 0.25
};

function MapClickHandler({ onSelect }) {
    useMapEvents({
        click(e) {
            onSelect(e.latlng.lat, e.latlng.lng);
        }
    });

    return null;
}

function FocusMap({ request }) {
    const map = useMap();

    useEffect(() => {
        if (request) {
            map.flyTo(
                [Number(request.latitude), Number(request.longitude)],
                request.zoom ?? 15,
                FLY_TO_OPTIONS
            );
        }
    }, [request, map]);

    return null;
}

export default function LocationPickerMap({
    latitude,
    longitude,
    onLocationSelected,
    focusRequest,
    disabled = false
}) {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const hasValidCoordinates =
        latitude !== ""
        && latitude !== null
        && latitude !== undefined
        && longitude !== ""
        && longitude !== null
        && longitude !== undefined
        && Number.isFinite(parsedLatitude)
        && Number.isFinite(parsedLongitude)
        && parsedLatitude >= -90
        && parsedLatitude <= 90
        && parsedLongitude >= -180
        && parsedLongitude <= 180;

    const initialPosition = hasValidCoordinates
        ? [parsedLatitude, parsedLongitude]
        : null;

    const [position, setPosition] = useState(initialPosition);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [locating, setLocating] = useState(false);

    useEffect(() => {
        if (hasValidCoordinates) {
            setPosition([
                parsedLatitude,
                parsedLongitude
            ]);
        }
    }, [hasValidCoordinates, parsedLatitude, parsedLongitude]);

    const useCurrentLocation = () => {
        if (disabled || locating) return;
        setMessage("");

        if (!navigator.geolocation) {
            setMessage("Your browser can't share your location — click your spot on the map instead.");
            return;
        }

        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                handleMapClick(pos.coords.latitude, pos.coords.longitude);
            },
            (error) => {
                setLocating(false);
                setMessage(
                    error.code === 1
                        ? "Location permission denied — click your spot on the map instead."
                        : "Couldn't get your location — click your spot on the map instead."
                );
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    const handleMapClick = async (lat, lng) => {
        setPosition([lat, lng]);
        setLoading(true);
        setMessage("");

        try {
            const response =
                await reverseGeocodeAddress(lat, lng);

            onLocationSelected(response.data);

            setMessage(
                "Location selected successfully."
            );

        } catch (error) {
            console.error(
                "Reverse geocoding failed:",
                error
            );

            setMessage(
                error.response?.data?.message ||
                "Unable to identify this location."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="hidden-gem-map-picker">

            <div className="hidden-gem-map-picker-header">
                <div>
                    <h4>Select Location on Map</h4>
                    <p>
                        Click on the map, or use your current location, to
                        automatically fill the address and coordinates.
                    </p>
                </div>
                {!disabled && (
                    <button
                        type="button"
                        className="hidden-gem-map-locate-btn"
                        onClick={useCurrentLocation}
                        disabled={locating || loading}
                    >
                        {locating ? "Locating…" : "📍 Use my current location"}
                    </button>
                )}
            </div>

            <div className="hidden-gem-map-picker-map">
                <MapContainer
                    center={initialPosition || MALAYSIA_CENTER}
                    zoom={initialPosition ? 15 : 7}
                    minZoom={6}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    wheelPxPerZoomLevel={70}
                    maxBounds={MALAYSIA_BOUNDS}
                    maxBoundsViscosity={1.0}
                    zoomControl={false}
                    style={{
                        height: "320px",
                        width: "100%"
                    }}
                >
                    <TileLayer
                        url={cartoTileUrl("rastertiles/voyager")}
                        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                    />

                    <ZoomControl position="bottomright" />

                    {!disabled && (
                        <MapClickHandler
                            onSelect={handleMapClick}
                        />
                    )}

                    <FocusMap request={focusRequest} />

                    {position && (
                        <Marker
                            position={position}
                            icon={customIcon}
                        />
                    )}
                </MapContainer>
            </div>

            {loading && (
                <p className="hidden-gem-map-status">
                    Finding address...
                </p>
            )}

            {!loading && message && (
                <p className="hidden-gem-map-status">
                    {message}
                </p>
            )}

        </div>
    );
}
