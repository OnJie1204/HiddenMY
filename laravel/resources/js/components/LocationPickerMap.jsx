import { useEffect, useState } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    GeoJSON,
    ZoomControl,
    useMap,
    useMapEvents
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import malaysia from "../assets/MYS.geo.json";
import { reverseGeocodeAddress } from "../api/hiddenGems";

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
                15,
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
    const initialPosition =
        latitude && longitude
            ? [Number(latitude), Number(longitude)]
            : null;

    const [position, setPosition] = useState(initialPosition);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (latitude && longitude) {
            setPosition([
                Number(latitude),
                Number(longitude)
            ]);
        }
    }, [latitude, longitude]);

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
                    <h4>🗺️ Select Location on Map</h4>
                    <p>
                        Click on the map to automatically fill
                        the address and coordinates.
                    </p>
                </div>
            </div>

            <div className="hidden-gem-map-picker-map">
                <MapContainer
                    center={MALAYSIA_CENTER}
                    zoom={7}
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
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                    />

                    <ZoomControl position="bottomright" />

                    <GeoJSON
                        data={malaysia}
                        style={{
                            color: "#14b8a6",
                            weight: 2,
                            fillColor: "#14b8a6",
                            fillOpacity: 0.12,
                        }}
                    />

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
