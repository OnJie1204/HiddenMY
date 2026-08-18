import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useRef } from "react";

const gemIcon = new L.Icon({
    iconUrl: "/images/gem_marker.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
});

// Dimmed variant for AI-approved gems still awaiting community votes,
// so Hidden Gem vs. awaiting-votes is visible at a glance on the map itself.
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

        icon={gem.status === "pending_community_vote" ? gemIconPending : gemIcon}
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
                    {gem.status === "pending_community_vote" && <> · Awaiting community votes</>}
                </small>
            </Popup>
        </Marker>
    );
}
export default HiddenGemMarker;
