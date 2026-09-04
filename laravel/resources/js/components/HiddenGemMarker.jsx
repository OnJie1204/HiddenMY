import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";

// Matches the stopping-point map (TripItineraryDetail.jsx): a small 24px pin
// rather than the old 40px one, so dense areas read as clusters sooner and
// individual gems don't blanket the map.
const ICON_BASE = {
    iconUrl: "/images/gem_marker.png",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -20],
};

const gemIcon = new L.Icon({ ...ICON_BASE, className: "gem-marker" });

// Dimmed variant for AI-approved gems still awaiting community votes,
// so Hidden Gem vs. awaiting-votes is visible at a glance on the map itself.
const gemIconPending = new L.Icon({ ...ICON_BASE, className: "gem-marker gem-marker-pending" });

// Greyed-out variant for gems the community confirmed as permanently closed.
const gemIconClosed = new L.Icon({ ...ICON_BASE, className: "gem-marker gem-marker-closed" });

// Gold-cast variant for well-known places — no longer "hidden", its own marker.
const gemIconWellKnown = new L.Icon({ ...ICON_BASE, className: "gem-marker gem-marker-well-known" });

export function getHiddenGemMarkerIcon(status, closed = false) {
    if (closed) return gemIconClosed;
    if (status === "well_known") return gemIconWellKnown;
    return status === "pending_community_vote" ? gemIconPending : gemIcon;
}

function HiddenGemMarker({ gem, onClick, markerRefs }) {
    const isClosed = !!(gem.permanentlyClosedAt || gem.permanently_closed_at);
    const isPending = gem.status === "pending_community_vote";
    const isWellKnown = gem.status === "well_known";

    // One clean meta line, same shape as the stopping-point map's popup:
    // category first, then distance / status when they apply.
    const meta = [
        gem.category || gem.state,
        gem.distanceKm != null
            ? gem.distanceKm < 1
                ? `${Math.round(gem.distanceKm * 1000)}m away`
                : `${gem.distanceKm.toFixed(1)}km away`
            : null,
        isClosed ? "Permanently closed" : isPending ? "Awaiting votes" : isWellKnown ? "Well-known place" : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <Marker
            ref={(instance) => {
                if (!markerRefs) return;
                if (instance) markerRefs.current[gem.id] = instance;
                else delete markerRefs.current[gem.id];
            }}
            position={[Number(gem.latitude), Number(gem.longitude)]}
            icon={getHiddenGemMarkerIcon(gem.status, isClosed)}
            riseOnHover={true}
            eventHandlers={{ click: () => onClick() }}
        >
            <Tooltip direction="top" offset={[0, -22]} opacity={1} className="gem-marker-tooltip">
                <div className="hidden-gem-marker-popup">
                    <strong>{gem.title}</strong>
                    {meta && <span>{meta}</span>}
                </div>
            </Tooltip>
        </Marker>
    );
}

export default HiddenGemMarker;
