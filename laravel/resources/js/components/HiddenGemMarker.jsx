import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useRef } from "react";


const gemIcon = new L.Icon({

    iconUrl:"/images/gem_marker.png",
    iconSize:[40, 40],
    iconAnchor:[20, 40]
});

function HiddenGemMarker({
    gem,
    onClick
}){
    const markerRef = useRef(null);

    return (
        <Marker
        ref={markerRef}
        position={[
            Number(gem.latitude),
            Number(gem.longitude)
        ]}

        icon={gemIcon}
    
        eventHandlers={{
            click:()=>{
                onClick();
            },
            mouseover:()=>{
                markerRef.current
                ?.openPopup();
            },
            mouseout:()=>{
                markerRef.current
                ?.closePopup();
            }
        }}
        >
            <Popup offset={[0, -25]}>
<<<<<<< HEAD
                <b>💎 {gem.place_name}</b>
                <br />
                <small>{gem.state}</small>
=======
                <b>💎 {gem.title}</b>
                <br/>
                <small>Hidden Gem</small>
>>>>>>> Interactive-Map
            </Popup>
        </Marker>
    );
}
export default HiddenGemMarker;