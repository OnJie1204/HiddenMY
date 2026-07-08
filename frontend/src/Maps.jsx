import { useEffect, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Define an icon directly, bypassing Leaflet's default mechanism, to ensure it displays correctly.
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

function FlyToUser({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, 15);
        }
    }, [position, map]);
    return null;
}

function Maps() {
    const [message, setMessage] = useState('Loading...');
    const [userPosition, setUserPosition] = useState(null);
    const [locationError, setLocationError] = useState(null);

    useEffect(() => {
        axios.get('http://127.0.0.1:8000/api/ping')
            .then(res => setMessage(res.data.message))
            .catch(err => setMessage('Error: ' + err.message));
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) {
            setLocationError('Your browser does not support location services.');
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

    const defaultCenter = [4.2105, 101.9758];

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h1>Gemora</h1>
            <p>Backend says: {message}</p>
            {locationError && <p style={{ color: 'orange' }}>{locationError}</p>}

            <MapContainer
                center={userPosition || defaultCenter}
                zoom={7}
                minZoom={6}
                maxBounds={MALAYSIA_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ height: '500px', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                />
                {userPosition && (
                    <>
                        <Marker position={userPosition} icon={customIcon}>
                            <Popup>current location</Popup>
                        </Marker>
                        <FlyToUser position={userPosition} />
                    </>
                )}
            </MapContainer>
        </div>
    );
}

export default Maps;