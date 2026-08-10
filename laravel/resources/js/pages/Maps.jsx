import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import "../../css/maps.css";

import {getHiddenGems} from "../api/hiddenGems";

import {createGemClusterIcon} from "../components/GemClusterIcon";
import HiddenGemMarker from "../components/HiddenGemMarker";
import SearchBar from "../components/SearchBar";
import SidePanel from "../components/SidePanel";
import AttractionMarker from "../components/AttractionMarker";
import RecentHiddenGemCard from "../components/RecentHiddenGemCard";

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

function FlyToUser({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, 15);
        }
    }, [position, map]);
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
    const [message,setMessage]=useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [recentPosts,setRecentPosts]=useState([]);

    useEffect(() => {
        axios.get('http://127.0.0.1:8000/api/ping')
            .then(res => setMessage(res.data.message))
            .catch(err => setMessage('Error: ' + err.message));
    }, []);

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
                image: raw.images?.[0]?.image_url ? `/storage/${raw.images[0].image_url}` : null,
                voteCount: raw.vote_count,
                category: raw.category?.name,
            };
        }
        // OSM / attraction result
        return {
            id: raw.id,
            source: "attraction",
            title: raw.name,
            latitude: raw.latitude,
            longitude: raw.longitude,
            image: null,
        };
    }

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

    const defaultCenter = [4.2105, 101.9758];

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
            <h1 className="maps-title">HiddenMY Interactive Map</h1>
            
            <SearchBar
                onSelect={(item) => {
                    if (item.source === "database") {
                        const gem = hiddenGems.find(g => g.id === item.id);
                        if (gem) setSelectedGroup([normalizeGem(gem, "database")]);
                        setSearchResults([]);
                    } else {
                        setSelectedGroup([normalizeGem(item, "attraction")]);
                        setSearchResults([item]);
                    }
                }}
            />

            {locationError &&
            <p className="maps-location-error">
                {locationError}
            </p>
            }

            <MapContainer
                center={userPosition || defaultCenter}
                zoom={7}
                minZoom={6}
                maxBounds={MALAYSIA_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ height: '500px', width: '100%' }}
            >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
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
                    onClick={() => setSelectedGroup(group)}
                />
            ))}
        </MarkerClusterGroup>
            {searchResults.map((place, index) => (
                <AttractionMarker
                    key={index}
                    place={place}
                    onClick={() => setSelectedGroup([normalizeGem(place, "attraction")])}
                />
            ))}
            <FlyToGem gem={selectedGroup ? selectedGroup[0] : null}/>
            </MapContainer>
            {!selectedGroup && (
                <div className="recent-section">

                    <h2>
                        Recent Hidden Gems
                    </h2>

                    <div className="recent-list">
                        {recentPosts.map(post => (
                            <RecentHiddenGemCard
                                key={post.id}
                                post={post}
                                onClick={() => setSelectedGroup([normalizeGem(post, "database")])}
                            />
                        ))}
                    </div>

                </div>
            )}
            <SidePanel
                group={selectedGroup}
                onClose={() => setSelectedGroup(null)}
            />
        </div>
    );
}

export default Maps;