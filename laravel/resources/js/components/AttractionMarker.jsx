import {Marker,Popup} from "react-leaflet";
import L from "leaflet";
import {useRef} from "react";


const attractionIcon = new L.Icon({
    iconUrl:"/images/attraction_marker.png",
    iconSize:[40, 40],
    iconAnchor:[20, 40]
});

function AttractionMarker({
    place,
    onClick
}){
    const markerRef = useRef(null);

    return (
        <Marker
        ref={markerRef}
        position={[
            Number(place.latitude),
            Number(place.longitude)
        ]}
        icon={attractionIcon}
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
                <b>📍 {place.title}</b>
                <br/>
                <small>Attraction</small>
            </Popup>
        </Marker>
    );
}
export default AttractionMarker;