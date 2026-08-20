import { useEffect, useMemo, useRef } from "react";
import {
    GeoJSON,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    useMap,
    ZoomControl,
} from "react-leaflet";
import L from "leaflet";

import malaysiaRegions from "../assets/malaysia-adm1.geo.json";

const CANONICAL_REGIONS = [
    "Johor",
    "Kedah",
    "Kelantan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Penang",
    "Perak",
    "Perlis",
    "Sabah",
    "Sarawak",
    "Selangor",
    "Terengganu",
    "Kuala Lumpur",
    "Putrajaya",
    "Labuan",
];

const CANONICAL_REGION_SET = new Set(CANONICAL_REGIONS);

const DATASET_REGION_ALIASES = {
    Malacca: "Melaka",
};

const MALAYSIA_BOUNDS = [
    [0.5, 99.5],
    [7.5, 119.5],
];

const PENINSULAR_MALAYSIA_CENTER = [4.2105, 101.9758];

const verifiedMarkerIcon = L.divIcon({
    className: "hiddenmy-journey-marker hiddenmy-journey-marker-verified",
    html: "<span aria-hidden=\"true\">◆</span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
});

const pendingMarkerIcon = L.divIcon({
    className: "hiddenmy-journey-marker hiddenmy-journey-marker-pending",
    html: "<span aria-hidden=\"true\">◆</span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
});

function InitialJourneyView() {
    const map = useMap();
    const applied = useRef(false);

    useEffect(() => {
        if (applied.current) return;

        applied.current = true;
        map.setView(
            PENINSULAR_MALAYSIA_CENTER,
            Math.min(map.getZoom() + 1, map.getMaxZoom()),
            { animate: false }
        );
    }, [map]);

    return null;
}

function canonicalRegionName(name) {
    const normalizedName = String(name ?? "").trim();

    if (DATASET_REGION_ALIASES[normalizedName]) {
        return DATASET_REGION_ALIASES[normalizedName];
    }

    return CANONICAL_REGION_SET.has(normalizedName)
        ? normalizedName
        : null;
}

function hasValidCoordinates(gem) {
    if (
        gem.latitude === ""
        || gem.latitude === null
        || gem.latitude === undefined
        || gem.longitude === ""
        || gem.longitude === null
        || gem.longitude === undefined
    ) {
        return false;
    }

    const latitude = Number(gem.latitude);
    const longitude = Number(gem.longitude);

    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180;
}

export default function HiddenGemJourneyMap({
    gems,
    selectedRegion,
    onRegionSelect,
    onViewDetails,
}) {
    const regionStats = useMemo(() => {
        const stats = Object.fromEntries(
            CANONICAL_REGIONS.map((region) => [
                region,
                {
                    name: region,
                    totalCount: 0,
                    verifiedCount: 0,
                    pendingCount: 0,
                    discovered: false,
                },
            ])
        );

        gems.forEach((gem) => {
            const region = canonicalRegionName(gem.state);

            if (!region) return;

            stats[region].totalCount += 1;

            if (gem.status === "verified") {
                stats[region].verifiedCount += 1;
                stats[region].discovered = true;
            } else if (gem.status === "pending") {
                stats[region].pendingCount += 1;
            }
        });

        return stats;
    }, [gems]);

    const mapMarkers = useMemo(
        () => gems.filter(hasValidCoordinates),
        [gems]
    );

    const normalizedSelectedRegion = canonicalRegionName(selectedRegion);
    const selectedRegionStats = normalizedSelectedRegion
        ? regionStats[normalizedSelectedRegion]
        : null;
    const discoveredRegions = CANONICAL_REGIONS.filter(
        (region) => regionStats[region].discovered
    );

    const regionStyle = (feature) => {
        const region = canonicalRegionName(feature.properties?.shapeName);
        const discovered = region ? regionStats[region].discovered : false;
        const selected = region === normalizedSelectedRegion;

        return {
            color: selected
                ? "#134e4a"
                : discovered
                    ? "#0f766e"
                    : "#94a3b8",
            weight: selected ? 3 : 1.5,
            fillColor: discovered ? "#14b8a6" : "#cbd5e1",
            fillOpacity: selected
                ? discovered ? 0.58 : 0.46
                : discovered ? 0.38 : 0.28,
        };
    };

    const bindRegionInteraction = (feature, layer) => {
        const region = canonicalRegionName(feature.properties?.shapeName);

        if (!region) return;

        layer.bindTooltip(region, {
            direction: "top",
            sticky: true,
        });

        layer.on("click", () => onRegionSelect(region));
    };

    return (
        <section className="hiddenmy-journey" aria-labelledby="hiddenmy-journey-title">
            <div className="hiddenmy-journey-header">
                <div>
                    <p className="hiddenmy-journey-eyebrow">Collection Map</p>
                    <h2 id="hiddenmy-journey-title">Your HiddenMY Journey</h2>
                </div>
                <p className="hiddenmy-journey-progress">
                    <strong>{discoveredRegions.length} / 16</strong>
                    <span>Regions Discovered</span>
                </p>
            </div>

            <div className="hiddenmy-journey-map">
                <MapContainer
                    bounds={MALAYSIA_BOUNDS}
                    boundsOptions={{ padding: [4, 4] }}
                    minZoom={4}
                    maxZoom={11}
                    maxBounds={MALAYSIA_BOUNDS}
                    maxBoundsViscosity={1.0}
                    zoomControl={false}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · Boundaries: <a href="https://www.geoboundaries.org/">geoBoundaries</a>'
                    />

                    <ZoomControl position="bottomright" />
                    <InitialJourneyView />

                    <GeoJSON
                        key={`${normalizedSelectedRegion || "all"}-${discoveredRegions.join("-")}`}
                        data={malaysiaRegions}
                        style={regionStyle}
                        onEachFeature={bindRegionInteraction}
                    />

                    {mapMarkers.map((gem) => (
                        <Marker
                            key={gem.id}
                            position={[Number(gem.latitude), Number(gem.longitude)]}
                            icon={gem.status === "verified"
                                ? verifiedMarkerIcon
                                : pendingMarkerIcon}
                            bubblingMouseEvents={false}
                            riseOnHover
                        >
                            <Popup className="hiddenmy-journey-popup">
                                <strong>{gem.place_name}</strong>
                                <span>{gem.state || "Unknown region"}</span>
                                <span className={`hiddenmy-journey-popup-status ${gem.status}`}>
                                    {gem.status === "verified" ? "Verified" : "Pending"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onViewDetails(gem.id)}
                                >
                                    View Details
                                </button>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            <div className="hiddenmy-journey-legend" aria-label="Map legend">
                <span><i className="discovered"></i> Discovered region</span>
                <span><i className="undiscovered"></i> Undiscovered region</span>
                <span><i className="verified-marker"></i> Verified gem</span>
                <span><i className="pending-marker"></i> Pending gem</span>
            </div>

            {selectedRegionStats && (
                <div className={`hiddenmy-journey-region-panel ${
                    selectedRegionStats.discovered ? "discovered" : "undiscovered"
                }`}>
                    <div>
                        <p className="hiddenmy-journey-region-name">
                            {selectedRegionStats.name}
                        </p>
                        <p className="hiddenmy-journey-region-state">
                            {selectedRegionStats.discovered
                                ? "Discovered"
                                : "Not Yet Discovered"}
                        </p>
                    </div>

                    <dl className="hiddenmy-journey-region-counts">
                        <div>
                            <dt>Total Hidden Gems</dt>
                            <dd>{selectedRegionStats.totalCount}</dd>
                        </div>
                        <div>
                            <dt>Verified</dt>
                            <dd>{selectedRegionStats.verifiedCount}</dd>
                        </div>
                        <div>
                            <dt>Pending</dt>
                            <dd>{selectedRegionStats.pendingCount}</dd>
                        </div>
                    </dl>

                    {!selectedRegionStats.discovered && (
                        <p className="hiddenmy-journey-region-hint">
                            Get one {selectedRegionStats.name} Hidden Gem verified
                            to discover this region.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
