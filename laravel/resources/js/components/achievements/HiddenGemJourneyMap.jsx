import { useEffect, useMemo, useRef } from "react";
import MarkerClusterGroup from "react-leaflet-cluster";
import {
    GeoJSON,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    useMap,
    ZoomControl,
} from "react-leaflet";

import malaysiaRegions from "@/assets/maps/malaysia-adm1.geo.json";
import GemImage from "@/components/hidden-gems/GemImage";
import { createGemClusterIcon } from "@/components/hidden-gems/GemClusterIcon";
import { getHiddenGemMarkerIcon } from "@/components/hidden-gems/HiddenGemMarker";
import { cartoTileUrl } from "@/utils/maps/cartoTiles";
import {
    isCurrentVerifiedContribution,
    isJourneyMarkerEligible,
    isLifetimeVerifiedContribution,
    journeyMarkerPresentation,
} from "@/utils/achievements/journey";

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
    [0.853821, 99.6404969],
    [7.3628175, 119.2690567],
];

function InitialJourneyView() {
    const map = useMap();
    const applied = useRef(false);

    useEffect(() => {
        if (applied.current) return;

        applied.current = true;
        map.fitBounds(MALAYSIA_BOUNDS, { padding: [4, 4], animate: false });
        map.setZoom(map.getZoom() + 0.1, { animate: false });
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
    permanentDiscoveredRegions = [],
    selectedRegion,
    onRegionSelect,
    onViewDetails,
}) {
    const journeyGems = useMemo(
        () => gems.filter((gem) => isJourneyMarkerEligible(gem.status)),
        [gems]
    );
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

        permanentDiscoveredRegions.forEach((regionName) => {
            const region = canonicalRegionName(regionName);
            if (region) stats[region].discovered = true;
        });

        journeyGems.forEach((gem) => {
            const region = canonicalRegionName(gem.state);

            if (!region) return;

            stats[region].totalCount += 1;

            if (isCurrentVerifiedContribution(gem.status)) {
                stats[region].verifiedCount += 1;
            }

            if (isLifetimeVerifiedContribution(gem.status)) {
                stats[region].discovered = true;
            } else if (gem.status === "pending_community_vote") {
                stats[region].pendingCount += 1;
            }
        });

        return stats;
    }, [journeyGems, permanentDiscoveredRegions]);

    const mapMarkers = useMemo(
        () => journeyGems.filter(hasValidCoordinates),
        [journeyGems]
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
                    zoomSnap={0.25}
                    minZoom={4}
                    maxZoom={11}
                    zoomControl={false}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        url={cartoTileUrl("light_all")}
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

                    <MarkerClusterGroup
                        iconCreateFunction={createGemClusterIcon}
                        zoomToBoundsOnClick={true}
                        spiderfyOnMaxZoom={true}
                        showCoverageOnHover={false}
                    >
                        {mapMarkers.map((gem) => {
                            const presentation = journeyMarkerPresentation(gem);

                            return <Marker
                                key={gem.id}
                                position={[Number(gem.latitude), Number(gem.longitude)]}
                                icon={getHiddenGemMarkerIcon(gem.status, presentation.closed)}
                                bubblingMouseEvents={false}
                                riseOnHover
                            >
                                <Popup
                                    className="hiddenmy-journey-popup"
                                    autoPan
                                    autoPanPadding={[24, 24]}
                                    minWidth={180}
                                    maxWidth={240}
                                >
                                    <GemImage
                                        src={gem.first_image?.image_url || gem.images?.[0]?.image_url}
                                        alt={gem.place_name}
                                        className="hiddenmy-journey-popup-image"
                                    />
                                    <strong>{gem.place_name}</strong>
                                    <span>{gem.state || "Unknown region"}</span>
                                    <span className={`hiddenmy-journey-popup-status ${presentation.tone}`}>
                                        {presentation.label}
                                    </span>
                                    {gem.status === "archived" ? (
                                        <p>This previously verified place is part of your HiddenMY Journey.</p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onViewDetails(gem.id)}
                                        >
                                            View Details
                                        </button>
                                    )}
                                </Popup>
                            </Marker>;
                        })}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>

            <div className="hiddenmy-journey-legend" aria-label="Map legend">
                <div className="hiddenmy-journey-legend-group" role="group" aria-label="Region legend">
                    <span><i className="discovered"></i> Discovered</span>
                    <span><i className="undiscovered"></i> Locked</span>
                </div>
                <div className="hiddenmy-journey-legend-group" role="group" aria-label="Journey marker legend">
                    <span><i className="verified-marker"></i> Verified Gem</span>
                    <span><i className="pending-marker"></i> Awaiting Community Votes</span>
                    <span><i className="well-known-marker"></i> Well-Known Place</span>
                    <span><i className="closed-marker"></i> Permanently Closed / Past Discovery</span>
                </div>
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
