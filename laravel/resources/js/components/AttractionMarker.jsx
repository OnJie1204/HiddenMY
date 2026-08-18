import {Marker,Popup} from "react-leaflet";
import {useRef} from "react";
import {createAttractionIcon} from "./AttractionIcon";

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
        icon={createAttractionIcon(place.type)}
        riseOnHover={true}
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
                <b>{place.name}</b>
                <br/>
                <small>{place.type ? place.type.replace(/_/g, " ") : "Attraction"}</small>
            </Popup>
        </Marker>
    );
}
export default AttractionMarker;
