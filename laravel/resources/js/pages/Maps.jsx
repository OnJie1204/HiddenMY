import { useEffect, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

<<<<<<< Updated upstream
// Define an icon directly, bypassing Leaflet's default mechanism, to ensure it displays correctly.
=======
import "leaflet/dist/leaflet.css";
import "../../css/maps.css";
import L from "leaflet";

import {getHiddenGems} from "../api/hiddenGems";

import HiddenGemMarker from "../components/HiddenGemMarker";
import SearchBar from "../components/SearchBar";
import BottomSheet from "../components/BottomSheet";
import AttractionMarker from "../components/AttractionMarker";
import RecentHiddenGemCard from "../components/RecentHiddenGemCard";

import api from "../api";


// Marker icon
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
function Maps() {
    const [message, setMessage] = useState('Loading...');
    const [userPosition, setUserPosition] = useState(null);
    const [locationError, setLocationError] = useState(null);
=======
function Maps(){
    const [hiddenGems,setHiddenGems]=useState([]);
    const [selectedGem,setSelectedGem]=useState(null);
    const [userPosition,setUserPosition]=useState(null);
    const [locationError,setLocationError]=useState("");
    const [message,setMessage]=useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
>>>>>>> Stashed changes

    useEffect(() => {
        axios.get('http://127.0.0.1:8000/api/ping')
            .then(res => setMessage(res.data.message))
            .catch(err => setMessage('Error: ' + err.message));
    }, []);

<<<<<<< Updated upstream
    useEffect(() => {
        if (!navigator.geolocation) {
            setLocationError('Your browser does not support location services.');
=======
    // Load hidden gems
    useEffect(()=>{
        getHiddenGems()
            .then(res => {
                console.log(res.data);
                setHiddenGems(res.data.data);
            })
            .catch(err => {
                console.log(err);
            });
    },[]);

    // Load recent hidden gems
    useEffect(()=>{
        api.get("/recent-hidden-gems")
        .then(res=>{
            setRecentPosts(res.data);
        });
    },[]);

    // Get user location
    useEffect(()=>{
        if(!navigator.geolocation){
            setLocationError("Location not supported");
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h1>Gemora</h1>
            <p>Backend says: {message}</p>
            {locationError && <p style={{ color: 'orange' }}>{locationError}</p>}
=======
    function FlyToGem({ gem }) {
        const map = useMap();
        useEffect(() => {
            if (gem) {
                map.flyTo(
                    [Number(gem.latitude), Number(gem.longitude)], 15
                );
            }
        }, [gem]);
        return null;
    }

    return (    
        <div className="maps-page">
            <h1 className="maps-title">Gemora Interactive Map</h1>
            
            <SearchBar
                onSelect={(item) => {
                if (item.source === "database") {
                    const gem = hiddenGems.find(g => g.id === item.id);
                    if (gem) {
                        setSelectedGem(gem);
                    }
                    setSearchResults([]);
                } else {
                    setSelectedGem(item);
                    setSearchResults([item]);
                }
                }}
            />

            <p>Backend: {message}</p>
            {locationError &&
            <p style={{color:"orange"}}>
                {locationError}
            </p>
            }
>>>>>>> Stashed changes

            <MapContainer
                center={userPosition || defaultCenter}
                zoom={7}
                minZoom={6}
                maxBounds={MALAYSIA_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ height: '500px', width: '100%' }}
            >
<<<<<<< Updated upstream
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
=======
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <GeoJSON
                data={malaysia}
                style={{
                    color: "#248bc7",
                    weight: 2,
                    fillColor: "#248bc7",
                    fillOpacity: 0.15,
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
            <>
                {hiddenGems.map((gem) => (
                    <HiddenGemMarker
                        key={gem.id}
                        gem={gem}
                        onClick={() => {
                            setSelectedGem(gem);
                        }}
                    />
                ))}
            </>
            {searchResults.map((place,index)=>(
                <AttractionMarker
                key={index}
                place={place}
                onClick={()=>{
                    setSelectedGem(place);
                }}
>>>>>>> Stashed changes
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