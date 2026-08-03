import {useEffect, useState} from "react";
import {MapContainer, TileLayer, Marker, Popup, useMap} from "react-leaflet";
import { GeoJSON } from "react-leaflet";
import malaysia from "../assets/MYS.geo.json";

<<<<<<< HEAD
<<<<<<< Updated upstream
// Define an icon directly, bypassing Leaflet's default mechanism, to ensure it displays correctly.
=======
=======
>>>>>>> Interactive-Map
import "leaflet/dist/leaflet.css";
import "../../css/maps.css";
import L from "leaflet";

<<<<<<< HEAD
import {getHiddenGems} from "../api/hiddenGems";
=======
import {getHiddenGems} from "../api/hiddenGemAPI";
import { searchPlaces } from "../api/searchAPI";
>>>>>>> Interactive-Map

import HiddenGemMarker from "../components/HiddenGemMarker";
import SearchBar from "../components/SearchBar";
import BottomSheet from "../components/BottomSheet";
import AttractionMarker from "../components/AttractionMarker";
import RecentHiddenGemCard from "../components/RecentHiddenGemCard";

import api from "../api";


// Marker icon
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> Interactive-Map
const customIcon = new L.Icon({
    iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize:[25,41],
    iconAnchor:[12,41]
});


// Malaysia boundary
const MALAYSIA_BOUNDS=[
    [-2,95],
    [10,121]
];

// Move map to user
function FlyToUser({position}){
    const map=useMap();
    useEffect(()=>{
        if(position){
            map.flyTo(position,15);
        }
    },[position]);
    return null;
}

<<<<<<< HEAD
<<<<<<< Updated upstream
function Maps() {
    const [message, setMessage] = useState('Loading...');
    const [userPosition, setUserPosition] = useState(null);
    const [locationError, setLocationError] = useState(null);
=======
=======
>>>>>>> Interactive-Map
function Maps(){
    const [hiddenGems,setHiddenGems]=useState([]);
    const [selectedGem,setSelectedGem]=useState(null);
    const [userPosition,setUserPosition]=useState(null);
    const [locationError,setLocationError]=useState("");
    const [message,setMessage]=useState("");
<<<<<<< HEAD
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
>>>>>>> Stashed changes
=======
    const [searchPlaces,setSearchPlaces]=useState([]);
    const [recentPosts,setRecentPosts]=useState([]);
>>>>>>> Interactive-Map

    // Test Laravel connection
    useEffect(()=>{
    api.get("/ping")
    .then(res=>{
        setMessage(res.data.message);
    })
    .catch(()=>{
        setMessage("Laravel connection failed");
    });
    },[]);

<<<<<<< HEAD
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
=======
    // Load hidden gems
    useEffect(()=>{
        getHiddenGems()
        .then(res=>{
        console.log("Hidden gems:",res.data);
        setHiddenGems(res.data);
        })
        .catch(err=>{
        console.log(err);
        });
>>>>>>> Interactive-Map
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
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> Interactive-Map
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position)=>{
                setUserPosition([
                    position.coords.latitude,
                    position.coords.longitude
                ]);
            },
            (error)=>{
                setLocationError(
                error.message
                );
            }
        );
    },[]);

    const defaultCenter=[
        4.2105,
        101.9758
    ];

<<<<<<< HEAD
<<<<<<< Updated upstream
    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h1>Gemora</h1>
            <p>Backend says: {message}</p>
            {locationError && <p style={{ color: 'orange' }}>{locationError}</p>}
=======
=======
>>>>>>> Interactive-Map
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
<<<<<<< HEAD
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
=======
                onSelect={(item)=>{
                    setSelectedGem(item);
                    if(item.type==="attraction"){
                        setSearchPlaces([
                            item
                        ]);
                    }
>>>>>>> Interactive-Map
                }}
            />

            <p>Backend: {message}</p>
            {locationError &&
            <p style={{color:"orange"}}>
                {locationError}
            </p>
            }
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> Interactive-Map

            <MapContainer
                center={userPosition || defaultCenter}
                zoom={7}
                minZoom={6}
                maxBounds={MALAYSIA_BOUNDS}
                maxBoundsViscosity={0.3}
                className="gemora-map"
            >
<<<<<<< HEAD
<<<<<<< Updated upstream
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
=======
=======
>>>>>>> Interactive-Map
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
<<<<<<< HEAD
            {searchResults.map((place,index)=>(
=======
            {searchPlaces.map((place,index)=>(
>>>>>>> Interactive-Map
                <AttractionMarker
                key={index}
                place={place}
                onClick={()=>{
                    setSelectedGem(place);
                }}
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> Interactive-Map
                />
            ))
            }
            <FlyToGem gem={selectedGem} />
            </MapContainer>

            {!selectedGem &&
            <div className="recent-section">
            <h2>Recent Hidden Gems</h2>

            {recentPosts.map(post=>(
            <RecentHiddenGemCard
            key={post.id}
            post={post}
            onClick={()=>{setSelectedGem(post);}}
            />
            ))
            }
            </div>
            }
            <BottomSheet
                gem={selectedGem}
                onClose={()=>{
                    setSelectedGem(null);
                }}
            />
        </div> 
    );
}

export default Maps;