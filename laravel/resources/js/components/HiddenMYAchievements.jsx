import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, useMap } from "react-leaflet";
import L from "leaflet";

import malaysiaRegions from "../assets/malaysia-adm1.geo.json";
import johorStamp from "../assets/achievements/johor.png";
import kedahStamp from "../assets/achievements/kedah.png";
import kelantanStamp from "../assets/achievements/kelantan.png";
import melakaStamp from "../assets/achievements/melaka.png";
import negeriSembilanStamp from "../assets/achievements/negeri sembilan.png";
import pahangStamp from "../assets/achievements/pahang.png";
import penangStamp from "../assets/achievements/penang.png";
import perakStamp from "../assets/achievements/perak.png";
import perlisStamp from "../assets/achievements/perlis.png";
import sabahStamp from "../assets/achievements/sabah.png";
import sarawakStamp from "../assets/achievements/sarawak.png";
import selangorStamp from "../assets/achievements/selangor.png";
import terengganuStamp from "../assets/achievements/terengganu.png";
import kualaLumpurStamp from "../assets/achievements/kl.png";
import putrajayaStamp from "../assets/achievements/putrajaya.png";
import labuanStamp from "../assets/achievements/labuan.png";
import gemMascot from "../assets/achievements/gem-mascot.png";
import firstFootprintArtwork from "../assets/achievements/special/first-footprint.png";
import gemHunterArtwork from "../assets/achievements/special/gem-hunter.png";
import halfwayThereArtwork from "../assets/achievements/special/halfway-there.png";
import voiceOfTheCommunityArtwork from "../assets/achievements/special/voice-of-the-community.png";
import westMalaysiaExplorerArtwork from "../assets/achievements/special/west-malaysia-explorer.png";
import eastMalaysiaExplorerArtwork from "../assets/achievements/special/east-malaysia-explorer.png";
import offTheBeatenPathArtwork from "../assets/achievements/special/off-the-beaten-path.png";
import hiddenmyMasterArtwork from "../assets/achievements/special/hiddenmy-master.png";

const REGIONS = [
    ["Johor", "Causeway Conqueror"],
    ["Kedah", "Scarecrow Substitute"],
    ["Kelantan", "Wau Gone Wild"],
    ["Melaka", "Trishaw Superstar"],
    ["Negeri Sembilan", "Minang Misfit"],
    ["Pahang", "Berry Bad Idea"],
    ["Penang", "Hokkien Mee Defender"],
    ["Perak", "White Coffee Overdrive"],
    ["Perlis", "Harumanis Heavyweight"],
    ["Sabah", "Kundasang Cow Scout"],
    ["Sarawak", "Cat Trail Explorer"],
    ["Selangor", "Highway Hero"],
    ["Terengganu", "Keropok Keeper"],
    ["Kuala Lumpur", "Forecast Fighter"],
    ["Putrajaya", "Roundabout Regular"],
    ["Labuan", "Duty-Free Disaster"],
];

const REGION_NAMES = new Set(REGIONS.map(([region]) => region));
const REGION_ALIASES = { Malacca: "Melaka" };
const REGION_STAMP_ARTWORK = {
    Johor: johorStamp,
    Kedah: kedahStamp,
    Kelantan: kelantanStamp,
    Melaka: melakaStamp,
    "Negeri Sembilan": negeriSembilanStamp,
    Pahang: pahangStamp,
    Penang: penangStamp,
    Perak: perakStamp,
    Perlis: perlisStamp,
    Sabah: sabahStamp,
    Sarawak: sarawakStamp,
    Selangor: selangorStamp,
    Terengganu: terengganuStamp,
    "Kuala Lumpur": kualaLumpurStamp,
    Putrajaya: putrajayaStamp,
    Labuan: labuanStamp,
};
const REGION_ACHIEVEMENT_TITLES = Object.fromEntries(REGIONS);
const SPECIAL_ACHIEVEMENT_ARTWORK = {
    "First Footprint": firstFootprintArtwork,
    "Gem Hunter": gemHunterArtwork,
    "Halfway There": halfwayThereArtwork,
    "Voice of the Community": voiceOfTheCommunityArtwork,
    "West Malaysia Explorer": westMalaysiaExplorerArtwork,
    "East Malaysia Explorer": eastMalaysiaExplorerArtwork,
    "Off the Beaten Path": offTheBeatenPathArtwork,
    "HiddenMY Master": hiddenmyMasterArtwork,
};
const WEST_MALAYSIA_REGIONS = [
    "Johor",
    "Kedah",
    "Kelantan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Penang",
    "Perak",
    "Perlis",
    "Selangor",
    "Terengganu",
    "Kuala Lumpur",
    "Putrajaya",
];
const EAST_MALAYSIA_REGIONS = ["Sabah", "Sarawak", "Labuan"];
const MALAYSIA_BOUNDS = [
    [0.853821, 99.6404969],
    [7.3628175, 119.2690567],
];
const mascotIcon = L.divIcon({
    className: "hiddenmy-mascot-marker",
    html: `<img src="${gemMascot}" alt="" />`,
    iconSize: [52, 52],
    iconAnchor: [26, 42],
});

function InitialAchievementView() {
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

function canonicalRegionName(value) {
    const region = String(value ?? "").trim();
    return REGION_ALIASES[region] || (REGION_NAMES.has(region) ? region : null);
}

function SpecialAchievementCard({ achievement, onPreview }) {
    const statusLabel = achievement.available
        ? achievement.unlocked ? "Completed" : "Locked"
        : achievement.loading ? "Loading" : "Unavailable";
    const progressPercent = achievement.available && achievement.target > 0
        ? Math.min(100, (achievement.progress / achievement.target) * 100)
        : 0;

    return (
        <article className={`hiddenmy-special-card ${achievement.unlocked ? "is-unlocked" : "is-locked"}`}>
            <div className="hiddenmy-special-card-heading">
                <div className="hiddenmy-special-placeholder" aria-hidden="true">
                    {achievement.unlocked ? "✓" : "★"}
                </div>
                <span>{statusLabel}</span>
            </div>
            <button
                type="button"
                className="hiddenmy-special-artwork"
                aria-label={`Preview ${achievement.title} achievement artwork`}
                onClick={() => onPreview(achievement)}
            >
                <img
                    src={SPECIAL_ACHIEVEMENT_ARTWORK[achievement.title]}
                    alt={`${achievement.title} achievement badge`}
                />
            </button>
            <h3>{achievement.title}</h3>
            <p className="hiddenmy-special-requirement">{achievement.requirement}</p>
            <div className="hiddenmy-special-progress">
                <div className="hiddenmy-special-progress-label">
                    <span>Progress</span>
                    <strong>{achievement.progressLabel}</strong>
                </div>
                <div
                    className="hiddenmy-special-progress-track"
                    role="progressbar"
                    aria-label={`${achievement.title} progress`}
                    aria-valuemin="0"
                    aria-valuemax={achievement.target}
                    aria-valuenow={achievement.available ? Math.min(achievement.progress, achievement.target) : 0}
                >
                    <span style={{ width: `${progressPercent}%` }} />
                </div>
            </div>
        </article>
    );
}

export default function HiddenMYAchievements({
    gems = [],
    gemsLoaded = false,
    votes = [],
    votesLoading = false,
    votesLoaded = false,
    votesError = "",
    categories = [],
    categoriesLoading = false,
    categoriesLoaded = false,
    categoriesError = "",
}) {
    const [collection, setCollection] = useState("regions");
    const [previewRegion, setPreviewRegion] = useState(null);
    const [previewSpecialAchievement, setPreviewSpecialAchievement] = useState(null);
    const [selectedMapRegion, setSelectedMapRegion] = useState(null);
    const [mascotPosition, setMascotPosition] = useState(null);
    const verifiedCounts = useMemo(() => {
        const counts = Object.fromEntries(REGIONS.map(([region]) => [region, 0]));

        gems.forEach((gem) => {
            if (gem.status !== "verified") return;

            const region = canonicalRegionName(gem.state);
            if (region) counts[region] += 1;
        });

        return counts;
    }, [gems]);

    const discoveredCount = Object.values(verifiedCounts)
        .filter((count) => count > 0).length;
    const verifiedGemCount = gems.filter(
        (gem) => gem.status === "verified"
    ).length;
    const discoveryProgress = (discoveredCount / REGIONS.length) * 100;
    useEffect(() => {
        if (!previewRegion && !previewSpecialAchievement) return undefined;

        const closeOnEscape = (event) => {
            if (event.key !== "Escape") return;

            setPreviewRegion(null);
            setPreviewSpecialAchievement(null);
        };

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [previewRegion, previewSpecialAchievement]);

    const specialAchievements = useMemo(() => {
        const discoveredRegions = new Set(
            Object.entries(verifiedCounts)
                .filter(([, count]) => count > 0)
                .map(([region]) => region)
        );
        const westCount = WEST_MALAYSIA_REGIONS.filter(
            (region) => discoveredRegions.has(region)
        ).length;
        const eastCount = EAST_MALAYSIA_REGIONS.filter(
            (region) => discoveredRegions.has(region)
        ).length;
        const uniqueVotedGemCount = new Set(
            votes
                .map((vote) => vote.location?.id)
                .filter((id) => id !== null && id !== undefined)
        ).size;
        const allCategoryIds = new Set(
            categories
                .map((category) => category.id)
                .filter((id) => id !== null && id !== undefined && id !== "")
                .map(String)
        );
        const verifiedCategoryIds = new Set(
            gems
                .filter((gem) => gem.status === "verified")
                .map((gem) => gem.category_id ?? gem.category?.id)
                .filter((id) => id !== null && id !== undefined && id !== "")
                .map(String)
        );
        const coveredCategoryCount = [...allCategoryIds].filter(
            (id) => verifiedCategoryIds.has(id)
        ).length;
        const categoriesAvailable = gemsLoaded
            && categoriesLoaded
            && !categoriesError
            && allCategoryIds.size > 0;
        const votesAvailable = votesLoaded && !votesError;

        return [
            {
                title: "First Footprint",
                requirement: "Get your first Hidden Gem verified.",
                progress: verifiedGemCount,
                target: 1,
                progressLabel: `${Math.min(verifiedGemCount, 1)} / 1`,
                unlocked: verifiedGemCount >= 1,
                available: gemsLoaded,
            },
            {
                title: "Gem Hunter",
                requirement: "Get 5 Hidden Gems verified.",
                progress: verifiedGemCount,
                target: 5,
                progressLabel: `${Math.min(verifiedGemCount, 5)} / 5`,
                unlocked: verifiedGemCount >= 5,
                available: gemsLoaded,
            },
            {
                title: "Halfway There",
                requirement: "Discover 8 of Malaysia's 16 regions.",
                progress: discoveredCount,
                target: 8,
                progressLabel: `${Math.min(discoveredCount, 8)} / 8`,
                unlocked: discoveredCount >= 8,
                available: gemsLoaded,
            },
            {
                title: "Voice of the Community",
                requirement: "Vote on 5 different Hidden Gem submissions.",
                progress: uniqueVotedGemCount,
                target: 5,
                progressLabel: votesAvailable
                    ? `${Math.min(uniqueVotedGemCount, 5)} / 5`
                    : votesLoading ? "Loading…" : "Unavailable",
                unlocked: votesAvailable && uniqueVotedGemCount >= 5,
                available: votesAvailable,
                loading: votesLoading,
            },
            {
                title: "West Malaysia Explorer",
                requirement: "Discover all 13 regions in West Malaysia.",
                progress: westCount,
                target: 13,
                progressLabel: `${westCount} / 13`,
                unlocked: westCount === 13,
                available: gemsLoaded,
            },
            {
                title: "East Malaysia Explorer",
                requirement: "Discover Sabah, Sarawak, and Labuan.",
                progress: eastCount,
                target: 3,
                progressLabel: `${eastCount} / 3`,
                unlocked: eastCount === 3,
                available: gemsLoaded,
            },
            {
                title: "Off the Beaten Path",
                requirement: "Get a Hidden Gem verified in every available category.",
                progress: coveredCategoryCount,
                target: allCategoryIds.size,
                progressLabel: categoriesAvailable
                    ? `${coveredCategoryCount} / ${allCategoryIds.size} Categories`
                    : categoriesLoading ? "Loading…" : "Unavailable",
                unlocked: categoriesAvailable
                    && [...allCategoryIds].every((id) => verifiedCategoryIds.has(id)),
                available: categoriesAvailable,
                loading: categoriesLoading,
            },
            {
                title: "HiddenMY Master",
                requirement: "Discover all 16 regions of Malaysia.",
                progress: discoveredCount,
                target: 16,
                progressLabel: `${discoveredCount} / 16`,
                unlocked: discoveredCount === 16,
                available: gemsLoaded,
            },
        ];
    }, [
        categories,
        categoriesError,
        categoriesLoaded,
        categoriesLoading,
        discoveredCount,
        gems,
        gemsLoaded,
        verifiedCounts,
        votes,
        votesError,
        votesLoaded,
        votesLoading,
        verifiedGemCount,
    ]);

    const regionStyle = (feature) => {
        const region = canonicalRegionName(feature.properties?.shapeName);
        const discovered = region ? verifiedCounts[region] > 0 : false;
        const selected = region === selectedMapRegion;

        return {
            color: selected
                ? discovered ? "#064e3b" : "#475569"
                : discovered ? "#0f766e" : "#94a3b8",
            weight: selected ? 3 : 1.5,
            fillColor: discovered ? "#14b8a6" : "#cbd5e1",
            fillOpacity: selected
                ? discovered ? 0.78 : 0.62
                : discovered ? 0.65 : 0.5,
        };
    };

    const bindRegionTooltip = (feature, layer) => {
        const region = canonicalRegionName(feature.properties?.shapeName);
        if (!region) return;

        const discovered = verifiedCounts[region] > 0;
        const tooltip = document.createElement("div");
        tooltip.className = "hiddenmy-map-stamp-tooltip";

        const name = document.createElement("strong");
        name.textContent = region;
        tooltip.appendChild(name);

        if (discovered) {
            const artwork = document.createElement("img");
            artwork.src = REGION_STAMP_ARTWORK[region];
            artwork.alt = `${region} achievement stamp`;
            tooltip.appendChild(artwork);

            const title = document.createElement("span");
            title.textContent = REGION_ACHIEVEMENT_TITLES[region];
            tooltip.appendChild(title);

            const status = document.createElement("small");
            status.textContent = "Discovered";
            tooltip.appendChild(status);
        } else {
            const hiddenStamp = document.createElement("span");
            hiddenStamp.textContent = "Hidden Stamp";
            tooltip.appendChild(hiddenStamp);

            const status = document.createElement("small");
            status.textContent = "Locked";
            tooltip.appendChild(status);

        }

        layer.bindTooltip(tooltip, {
            className: "hiddenmy-map-stamp-tooltip-shell",
            direction: "top",
            sticky: true,
        });

        layer.on("click", () => {
            setSelectedMapRegion(region);

            if (!discovered) {
                setMascotPosition(null);
                return;
            }

            const center = layer.getBounds().getCenter();
            setMascotPosition([center.lat, center.lng]);
        });
    };

    return (
        <section className="hiddenmy-achievements" aria-labelledby="hiddenmy-passport-title">
            <header className="hiddenmy-achievements-header">
                <div className="hiddenmy-passport-intro">
                    <p className="hiddenmy-achievements-eyebrow">Achievements</p>
                    <h2 id="hiddenmy-passport-title">HiddenMY Passport</h2>
                    <p>Explore Malaysia. Discover what others miss.</p>
                </div>
                <div className="hiddenmy-passport-dashboard">
                    <div className="hiddenmy-achievements-progress">
                        <div className="hiddenmy-achievements-progress-label">
                            <strong>{discoveredCount} / 16</strong>
                            <span>Regions Discovered</span>
                        </div>
                        <div
                            className="hiddenmy-achievements-progress-track"
                            role="progressbar"
                            aria-label="Malaysia regions discovered"
                            aria-valuemin="0"
                            aria-valuemax={REGIONS.length}
                            aria-valuenow={discoveredCount}
                        >
                            <span style={{ width: `${discoveryProgress}%` }} />
                        </div>
                    </div>
                    <dl className="hiddenmy-passport-stats">
                        <div>
                            <dd>{verifiedGemCount}</dd>
                            <dt>Verified Gems</dt>
                        </div>
                        <div>
                            <dd>{discoveredCount}</dd>
                            <dt>Region Stamps</dt>
                        </div>
                    </dl>
                </div>
            </header>

            <div className="hiddenmy-achievements-map" aria-label="Malaysia region collection map">
                <MapContainer
                    zoomSnap={0.25}
                    zoomControl={false}
                    attributionControl={false}
                    style={{ height: "100%", width: "100%" }}
                >
                    <InitialAchievementView />
                    <GeoJSON
                        key={`${JSON.stringify(verifiedCounts)}-${selectedMapRegion || "none"}`}
                        data={malaysiaRegions}
                        style={regionStyle}
                        onEachFeature={bindRegionTooltip}
                    />
                    {mascotPosition && (
                        <Marker
                            key={`${mascotPosition[0]}-${mascotPosition[1]}`}
                            position={mascotPosition}
                            icon={mascotIcon}
                            interactive={false}
                            keyboard={false}
                            zIndexOffset={500}
                        />
                    )}
                </MapContainer>
                <div className="hiddenmy-map-compass" aria-hidden="true">
                    <span className="hiddenmy-map-compass-north">N</span>
                    <span className="hiddenmy-map-compass-east">E</span>
                    <span className="hiddenmy-map-compass-south">S</span>
                    <span className="hiddenmy-map-compass-west">W</span>
                    <span className="hiddenmy-map-compass-needle" />
                </div>
                <div className="hiddenmy-map-legend" aria-label="Map legend">
                    <span><i className="is-discovered" aria-hidden="true" />Discovered</span>
                    <span><i className="is-locked" aria-hidden="true" />Locked</span>
                </div>
            </div>

            <div className="hiddenmy-collection-switch" role="tablist" aria-label="Achievement collection">
                <button
                    type="button"
                    role="tab"
                    aria-selected={collection === "regions"}
                    className={collection === "regions" ? "active" : ""}
                    onClick={() => setCollection("regions")}
                >
                    Region Stamps
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={collection === "special"}
                    className={collection === "special" ? "active" : ""}
                    onClick={() => setCollection("special")}
                >
                    Special Achievements
                </button>
            </div>

            {collection === "regions" ? (
                <div className="hiddenmy-stamp-grid">
                {REGIONS.map(([region, title]) => {
                    const count = verifiedCounts[region];
                    const discovered = count > 0;

                    return (
                        <article
                            key={region}
                            className={`hiddenmy-stamp-card ${discovered ? "is-discovered is-clickable" : "is-locked"}`}
                            role={discovered ? "button" : undefined}
                            tabIndex={discovered ? 0 : undefined}
                            aria-label={discovered ? `View ${region} achievement stamp` : undefined}
                            onClick={discovered ? () => setPreviewRegion(region) : undefined}
                            onKeyDown={discovered ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setPreviewRegion(region);
                                }
                            } : undefined}
                        >
                            <div className="hiddenmy-stamp-card-heading">
                                <h3>{region}</h3>
                                <span>{discovered ? "Discovered" : "Locked"}</span>
                            </div>
                            {discovered ? (
                                <div className="hiddenmy-stamp-artwork">
                                    <img
                                        src={REGION_STAMP_ARTWORK[region]}
                                        alt={`${region} achievement stamp`}
                                    />
                                </div>
                            ) : (
                                <div className="hiddenmy-stamp-placeholder" aria-hidden="true">
                                    ?
                                </div>
                            )}
                            {discovered ? (
                                <div className="hiddenmy-stamp-details">
                                    <p className="hiddenmy-stamp-title">{title}</p>
                                    <p>{count} verified Hidden {count === 1 ? "Gem" : "Gems"}</p>
                                </div>
                            ) : (
                                <div className="hiddenmy-stamp-details">
                                    <p className="hiddenmy-stamp-title">Hidden Stamp</p>
                                    <p>Get one Hidden Gem in {region} verified to reveal this stamp.</p>
                                </div>
                            )}
                        </article>
                    );
                })}
                </div>
            ) : (
                <div className="hiddenmy-special-grid">
                    {specialAchievements.map((achievement) => (
                        <SpecialAchievementCard
                            key={achievement.title}
                            achievement={achievement}
                            onPreview={setPreviewSpecialAchievement}
                        />
                    ))}
                </div>
            )}

            {previewRegion && (
                <div
                    className="hiddenmy-stamp-modal-backdrop"
                    onClick={() => setPreviewRegion(null)}
                >
                    <div
                        className="hiddenmy-stamp-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hiddenmy-stamp-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="hiddenmy-stamp-modal-close"
                            aria-label="Close achievement stamp preview"
                            onClick={() => setPreviewRegion(null)}
                        >
                            &times;
                        </button>
                        <div className="hiddenmy-stamp-modal-artwork">
                            <img
                                src={REGION_STAMP_ARTWORK[previewRegion]}
                                alt={`${previewRegion} achievement stamp`}
                            />
                        </div>
                        <div className="hiddenmy-stamp-modal-details">
                            <span>Discovered</span>
                            <h2 id="hiddenmy-stamp-modal-title">{previewRegion}</h2>
                            <p className="hiddenmy-stamp-modal-title">
                                {REGION_ACHIEVEMENT_TITLES[previewRegion]}
                            </p>
                            <p>
                                {verifiedCounts[previewRegion]} verified Hidden {verifiedCounts[previewRegion] === 1 ? "Gem" : "Gems"}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {previewSpecialAchievement && (
                <div
                    className="hiddenmy-stamp-modal-backdrop"
                    onClick={() => setPreviewSpecialAchievement(null)}
                >
                    <div
                        className={`hiddenmy-stamp-modal hiddenmy-special-modal ${previewSpecialAchievement.unlocked ? "is-unlocked" : "is-locked"}`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hiddenmy-special-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="hiddenmy-stamp-modal-close"
                            aria-label="Close special achievement preview"
                            onClick={() => setPreviewSpecialAchievement(null)}
                        >
                            &times;
                        </button>
                        <div className="hiddenmy-stamp-modal-artwork hiddenmy-special-modal-artwork">
                            <img
                                src={SPECIAL_ACHIEVEMENT_ARTWORK[previewSpecialAchievement.title]}
                                alt={`${previewSpecialAchievement.title} achievement badge`}
                            />
                        </div>
                        <div className="hiddenmy-stamp-modal-details">
                            <span>{previewSpecialAchievement.unlocked ? "Completed" : "Locked"}</span>
                            <h2 id="hiddenmy-special-modal-title">
                                {previewSpecialAchievement.title}
                            </h2>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
