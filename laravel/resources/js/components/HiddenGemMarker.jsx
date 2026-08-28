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

export function getHiddenGemMarkerIcon(status) {
    return status === "pending_community_vote" ? gemIconPending : gemIcon;
}

function HiddenGemMarker({
    gem,
    onClick
}){
    const markerRef = useRef(null);
    const isPending = gem.status === "pending_community_vote";

    return (
        <Marker
        ref={markerRef}
        position={[
            Number(gem.latitude),
            Number(gem.longitude)
        ]}

        icon={getHiddenGemMarkerIcon(gem.status)}
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
            <Popup offset={[0, -30]}>
                <b>{gem.title}</b>
                <br />
                <small>
                    {gem.category || gem.state}
                    {gem.ratingCount > 0 && <> · ★ {gem.ratingAvg?.toFixed(1)} ({gem.ratingCount})</>}
                    {gem.distanceKm != null && <> · {gem.distanceKm < 1
                        ? `${Math.round(gem.distanceKm * 1000)}m away`
                        : `${gem.distanceKm.toFixed(1)}km away`}</>}
                    {isPending && <> · Awaiting community votes</>}
                </small>
            </Popup>
        </Marker>
    );
}
export default HiddenGemMarker;
