import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useRef } from "react";

const gemIcon = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
});

// Dimmed variant for gems that haven't been community-verified yet,
// so verified vs. pending is visible at a glance on the map itself.
const gemIconPending = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    className: "gem-marker-pending",
});

function HiddenGemMarker({
    gem,
    postCount,
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

        icon={gem.status === "pending" ? gemIconPending : gemIcon}
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
                <b>💎 {gem.title}</b>
                <br />
                <small>
                    {gem.state}
                    {postCount > 1 && <> · {postCount} posts here</>}
                    {gem.status === "pending" && <> · Pending verification</>}
                </small>
            </Popup>
        </Marker>
    );
}
export default HiddenGemMarker;
