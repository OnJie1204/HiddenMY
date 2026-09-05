import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, useMap } from "react-leaflet";
import L from "leaflet";

import malaysiaRegions from "@/assets/maps/malaysia-adm1.geo.json";
import johorStamp from "@/assets/achievements/johor.webp";
import kedahStamp from "@/assets/achievements/kedah.webp";
import kelantanStamp from "@/assets/achievements/kelantan.webp";
import melakaStamp from "@/assets/achievements/melaka.webp";
import negeriSembilanStamp from "@/assets/achievements/negeri sembilan.webp";
import pahangStamp from "@/assets/achievements/pahang.webp";
import penangStamp from "@/assets/achievements/penang.webp";
import perakStamp from "@/assets/achievements/perak.webp";
import perlisStamp from "@/assets/achievements/perlis.webp";
import sabahStamp from "@/assets/achievements/sabah.webp";
import sarawakStamp from "@/assets/achievements/sarawak.webp";
import selangorStamp from "@/assets/achievements/selangor.webp";
import terengganuStamp from "@/assets/achievements/terengganu.webp";
import kualaLumpurStamp from "@/assets/achievements/kl.webp";
import putrajayaStamp from "@/assets/achievements/putrajaya.webp";
import labuanStamp from "@/assets/achievements/labuan.webp";
import gemMascot from "@/assets/achievements/gem-mascot.webp";
import {
    getFavouriteAchievements,
    syncAchievements,
    updateFavouriteAchievements,
} from "@/features/users/achievementsApi";
import { SPECIAL_ACHIEVEMENT_METADATA } from "@/constants/achievements/specialAchievements";

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

function isOtherCategory(category) {
    return String(category?.name ?? "").trim().toLowerCase() === "others";
}

function specialAchievementStatusLabel(achievement) {
    return achievement.available
        ? achievement.unlocked ? "Earned" : "Locked"
        : achievement.loading ? "Loading" : "Unavailable";
}

function specialAchievementGuidance(achievement) {
    if (!achievement.available) {
        return achievement.loading
            ? "Progress data is loading."
            : "Progress data is currently unavailable.";
    }

    if (achievement.unlocked) {
        return achievement.completionMessage || "Achievement earned!";
    }

    const remaining = Math.max(0, achievement.target - achievement.progress);
    const unit = remaining === 1
        ? achievement.remainingUnitSingular
        : achievement.remainingUnitPlural;

    return `${remaining} more ${unit} to earn`;
}

function FavouriteAchievementControl({ achievement, isFavourite, disabled, onToggle }) {
    if (!achievement.available || !achievement.unlocked) return null;

    return (
        <button
            type="button"
            className={`hiddenmy-favourite-control ${isFavourite ? "is-favourite" : ""}`}
            aria-pressed={isFavourite}
            disabled={disabled}
            onClick={() => onToggle(achievement.key)}
        >
            <span aria-hidden="true">{isFavourite ? "★" : "☆"}</span>
            {isFavourite ? "Favourite" : "Add to Favourites"}
        </button>
    );
}

function SpecialAchievementCard({ achievement, onPreview, favouriteProps }) {
    const statusLabel = achievement.available
        ? achievement.unlocked ? "Earned" : "Locked"
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
                    src={SPECIAL_ACHIEVEMENT_METADATA[achievement.key].artwork}
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
            {favouriteProps.loaded && (
                <FavouriteAchievementControl
                    achievement={achievement}
                    isFavourite={favouriteProps.keys.includes(achievement.key)}
                    disabled={favouriteProps.saving}
                    onToggle={favouriteProps.onToggle}
                />
            )}
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
    const [specialFilter, setSpecialFilter] = useState("all");
    const [previewRegion, setPreviewRegion] = useState(null);
    const [previewSpecialAchievement, setPreviewSpecialAchievement] = useState(null);
    const [selectedMapRegion, setSelectedMapRegion] = useState(null);
    const [mascotPosition, setMascotPosition] = useState(null);
    const [favouriteKeys, setFavouriteKeys] = useState([]);
    const [favouritesLoading, setFavouritesLoading] = useState(true);
    const [favouritesLoaded, setFavouritesLoaded] = useState(false);
    const [favouritesSaving, setFavouritesSaving] = useState(false);
    const [favouritesError, setFavouritesError] = useState("");
    const [permanentAwardKeys, setPermanentAwardKeys] = useState([]);
    const currentVerifiedCounts = useMemo(() => {
        const counts = Object.fromEntries(REGIONS.map(([region]) => [region, 0]));

        gems.forEach((gem) => {
            if (gem.status !== "hidden_gem") return;

            const region = canonicalRegionName(gem.state);
            if (region) counts[region] += 1;
        });

        return counts;
    }, [gems]);
    const verifiedCounts = useMemo(() => {
        const counts = { ...currentVerifiedCounts };

        REGIONS.forEach(([region]) => {
            const key = `region:${region.toLowerCase().replaceAll(" ", "-")}`;
            if (permanentAwardKeys.includes(key)) {
                counts[region] = Math.max(1, counts[region]);
            }
        });

        return counts;
    }, [currentVerifiedCounts, permanentAwardKeys]);

    const discoveredCount = Object.values(verifiedCounts)
        .filter((count) => count > 0).length;
    const currentDiscoveredCount = Object.values(currentVerifiedCounts)
        .filter((count) => count > 0).length;
    const verifiedGemCount = gems.filter(
        (gem) => gem.status === "hidden_gem"
    ).length;
    const discoveryProgress = (discoveredCount / REGIONS.length) * 100;
    useEffect(() => {
        let active = true;

        async function loadFavourites() {
            try {
                const syncResponse = await syncAchievements();
                if (!active) return;
                setPermanentAwardKeys(
                    (syncResponse.data?.data || []).map((achievement) => achievement.key)
                );

                const response = await getFavouriteAchievements();
                if (!active) return;

                const orderedFavourites = [...(response.data?.data || [])]
                    .sort((first, second) => first.position - second.position)
                    .map((favourite) => favourite.key);

                setFavouriteKeys(orderedFavourites);
                setFavouritesLoaded(true);
                setFavouritesError("");
            } catch {
                if (!active) return;
                setFavouritesError("Favourite Achievements could not be loaded. Please try again later.");
            } finally {
                if (active) setFavouritesLoading(false);
            }
        }

        loadFavourites();

        return () => {
            active = false;
        };
    }, []);

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
            Object.entries(currentVerifiedCounts)
                .filter(([, count]) => count > 0)
                .map(([region]) => region)
        );
        const westCount = WEST_MALAYSIA_REGIONS.filter(
            (region) => discoveredRegions.has(region)
        ).length;
        const eastCount = EAST_MALAYSIA_REGIONS.filter(
            (region) => discoveredRegions.has(region)
        ).length;
        const remainingWestRegions = WEST_MALAYSIA_REGIONS.filter(
            (region) => !discoveredRegions.has(region)
        );
        const remainingEastRegions = EAST_MALAYSIA_REGIONS.filter(
            (region) => !discoveredRegions.has(region)
        );
        const remainingMalaysiaRegions = REGIONS
            .map(([region]) => region)
            .filter((region) => !discoveredRegions.has(region));
        const uniqueVotedGemCount = new Set(
            votes
                .map((vote) => vote.location?.id)
                .filter((id) => id !== null && id !== undefined)
        ).size;
        const achievementCategories = categories.filter(
            (category) => !isOtherCategory(category)
        );
        const allCategoryIds = new Set(
            achievementCategories
                .map((category) => category.id)
                .filter((id) => id !== null && id !== undefined && id !== "")
                .map(String)
        );
        const verifiedCategoryIds = new Set(
            gems
                .filter((gem) => gem.status === "hidden_gem")
                .map((gem) => gem.category_id ?? gem.category?.id)
                .filter((id) => id !== null && id !== undefined && id !== "")
                .map(String)
        );
        const coveredCategoryCount = [...allCategoryIds].filter(
            (id) => verifiedCategoryIds.has(id)
        ).length;
        const remainingCategoryNames = achievementCategories
            .filter((category) => {
                const id = category.id;
                return id !== null
                    && id !== undefined
                    && id !== ""
                    && !verifiedCategoryIds.has(String(id));
            })
            .map((category) => category.name);
        const categoriesAvailable = gemsLoaded
            && categoriesLoaded
            && !categoriesError
            && allCategoryIds.size > 0;
        const votesAvailable = votesLoaded && !votesError;

        const calculated = [
            {
                key: "first-footprint",
                title: SPECIAL_ACHIEVEMENT_METADATA["first-footprint"].title,
                requirement: "Get your first Hidden Gem verified.",
                progress: verifiedGemCount,
                target: 1,
                progressLabel: `${Math.min(verifiedGemCount, 1)} / 1`,
                unlocked: verifiedGemCount >= 1,
                available: gemsLoaded,
                remainingUnitSingular: "verified Hidden Gem",
                remainingUnitPlural: "verified Hidden Gems",
            },
            {
                key: "gem-hunter",
                title: SPECIAL_ACHIEVEMENT_METADATA["gem-hunter"].title,
                requirement: "Get 5 Hidden Gems verified.",
                progress: verifiedGemCount,
                target: 5,
                progressLabel: `${Math.min(verifiedGemCount, 5)} / 5`,
                unlocked: verifiedGemCount >= 5,
                available: gemsLoaded,
                remainingUnitSingular: "verified Hidden Gem",
                remainingUnitPlural: "verified Hidden Gems",
            },
            {
                key: "halfway-there",
                title: SPECIAL_ACHIEVEMENT_METADATA["halfway-there"].title,
                requirement: "Discover 8 of Malaysia's 16 regions.",
                progress: currentDiscoveredCount,
                target: 8,
                progressLabel: `${Math.min(currentDiscoveredCount, 8)} / 8`,
                unlocked: currentDiscoveredCount >= 8,
                available: gemsLoaded,
                remainingUnitSingular: "region",
                remainingUnitPlural: "regions",
            },
            {
                key: "voice-of-the-community",
                title: SPECIAL_ACHIEVEMENT_METADATA["voice-of-the-community"].title,
                requirement: "Vote on 5 different Hidden Gem submissions.",
                progress: uniqueVotedGemCount,
                target: 5,
                progressLabel: votesAvailable
                    ? `${Math.min(uniqueVotedGemCount, 5)} / 5`
                    : votesLoading ? "Loading…" : "Unavailable",
                unlocked: votesAvailable && uniqueVotedGemCount >= 5,
                available: votesAvailable,
                loading: votesLoading,
                remainingUnitSingular: "Hidden Gem to vote on",
                remainingUnitPlural: "Hidden Gems to vote on",
            },
            {
                key: "west-malaysia-explorer",
                title: SPECIAL_ACHIEVEMENT_METADATA["west-malaysia-explorer"].title,
                requirement: "Discover all 13 regions in West Malaysia.",
                progress: westCount,
                target: 13,
                progressLabel: `${westCount} / 13`,
                unlocked: westCount === 13,
                available: gemsLoaded,
                remainingItemsLabel: "Regions remaining",
                remainingItems: remainingWestRegions,
                completionMessage: "All required regions discovered.",
            },
            {
                key: "east-malaysia-explorer",
                title: SPECIAL_ACHIEVEMENT_METADATA["east-malaysia-explorer"].title,
                requirement: "Discover Sabah, Sarawak, and Labuan.",
                progress: eastCount,
                target: 3,
                progressLabel: `${eastCount} / 3`,
                unlocked: eastCount === 3,
                available: gemsLoaded,
                remainingItemsLabel: "Regions remaining",
                remainingItems: remainingEastRegions,
                completionMessage: "All required regions discovered.",
            },
            {
                key: "off-the-beaten-path",
                title: SPECIAL_ACHIEVEMENT_METADATA["off-the-beaten-path"].title,
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
                remainingItemsLabel: "Categories remaining",
                remainingItems: remainingCategoryNames,
                completionMessage: "All required categories discovered.",
            },
            {
                key: "hiddenmy-master",
                title: SPECIAL_ACHIEVEMENT_METADATA["hiddenmy-master"].title,
                requirement: "Discover all 16 regions of Malaysia.",
                progress: currentDiscoveredCount,
                target: 16,
                progressLabel: `${currentDiscoveredCount} / 16`,
                unlocked: currentDiscoveredCount === 16,
                available: gemsLoaded,
                remainingItemsLabel: "Regions remaining",
                remainingItems: remainingMalaysiaRegions,
                completionMessage: "All required regions discovered.",
            },
        ];

        return calculated.map((achievement) => {
            if (!permanentAwardKeys.includes(achievement.key)) {
                return achievement;
            }

            return {
                ...achievement,
                progress: achievement.target,
                progressLabel: achievement.key === "off-the-beaten-path"
                    ? `${achievement.target} / ${achievement.target} Categories`
                    : `${achievement.target} / ${achievement.target}`,
                unlocked: true,
                available: true,
                loading: false,
                remainingItems: [],
            };
        });
    }, [
        categories,
        categoriesError,
        categoriesLoaded,
        categoriesLoading,
        currentDiscoveredCount,
        currentVerifiedCounts,
        gems,
        gemsLoaded,
        permanentAwardKeys,
        verifiedCounts,
        votes,
        votesError,
        votesLoaded,
        votesLoading,
        verifiedGemCount,
    ]);
    const filteredSpecialAchievements = specialAchievements.filter((achievement) => {
        if (specialFilter === "unlocked") {
            return achievement.available && achievement.unlocked;
        }

        if (specialFilter === "locked") {
            return achievement.available && !achievement.unlocked;
        }

        return true;
    });
    const filteredSpecialDataPending = specialFilter !== "all"
        && specialAchievements.some((achievement) => !achievement.available);
    const activePreviewSpecialAchievement = previewSpecialAchievement
        ? specialAchievements.find(
            (achievement) => achievement.key === previewSpecialAchievement.key
        ) || previewSpecialAchievement
        : null;
    const previewSpecialProgressPercent = activePreviewSpecialAchievement?.available
        && activePreviewSpecialAchievement.target > 0
        ? Math.min(
            100,
            (activePreviewSpecialAchievement.progress / activePreviewSpecialAchievement.target) * 100
        )
        : 0;

    const toggleFavourite = async (achievementKey) => {
        if (!favouritesLoaded || favouritesSaving) return;

        const isFavourite = favouriteKeys.includes(achievementKey);
        if (!isFavourite && favouriteKeys.length >= 2) {
            setFavouritesError("You can choose up to 2 Favourite Achievements. Remove one first.");
            return;
        }

        const desiredKeys = isFavourite
            ? favouriteKeys.filter((key) => key !== achievementKey)
            : [...favouriteKeys, achievementKey];

        setFavouritesSaving(true);
        setFavouritesError("");

        try {
            const response = await updateFavouriteAchievements(desiredKeys);
            const confirmedKeys = [...(response.data?.data || [])]
                .sort((first, second) => first.position - second.position)
                .map((favourite) => favourite.key);

            setFavouriteKeys(confirmedKeys);
        } catch (error) {
            const validationMessage = error.response?.data?.errors?.achievement_keys?.[0];
            setFavouritesError(
                validationMessage || "Favourite Achievements could not be saved. Please try again."
            );
        } finally {
            setFavouritesSaving(false);
        }
    };

    const favouriteProps = {
        keys: favouriteKeys,
        loaded: favouritesLoaded,
        saving: favouritesSaving,
        onToggle: toggleFavourite,
    };

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
                <div className="hiddenmy-special-collection">
                    <div className="hiddenmy-special-collection-header">
                        <h2>Special Achievements</h2>
                        <div className="hiddenmy-special-controls">
                            <div className="hiddenmy-special-filters" role="tablist" aria-label="Filter Special Achievements">
                                {[
                                    ["all", "All"],
                                    ["unlocked", "Earned"],
                                    ["locked", "Locked"],
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={specialFilter === value}
                                        className={specialFilter === value ? "active" : ""}
                                        onClick={() => setSpecialFilter(value)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <span className="hiddenmy-favourite-summary">
                                <span aria-hidden="true">★</span>{" "}
                                {favouritesLoading
                                    ? "Loading favourites…"
                                    : favouritesLoaded
                                        ? `${favouriteKeys.length} of 2 selected for display`
                                        : "Favourites unavailable"}
                            </span>
                        </div>
                    </div>

                    {favouritesError && (
                        <p className="hiddenmy-favourites-message" role="status">
                            {favouritesError}
                        </p>
                    )}

                    {filteredSpecialAchievements.length > 0 ? (
                        <div className="hiddenmy-special-grid">
                            {filteredSpecialAchievements.map((achievement) => (
                                <SpecialAchievementCard
                                    key={achievement.key}
                                    achievement={achievement}
                                    onPreview={setPreviewSpecialAchievement}
                                    favouriteProps={favouriteProps}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="hiddenmy-special-empty">
                            {filteredSpecialDataPending
                                ? "Achievement status is still loading or unavailable."
                                : specialFilter === "unlocked"
                                    ? "No achievements earned yet. Keep exploring HiddenMY!"
                                    : "All Special Achievements are earned!"}
                        </div>
                    )}
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
                        className={`hiddenmy-stamp-modal hiddenmy-special-modal ${activePreviewSpecialAchievement.unlocked ? "is-unlocked" : "is-locked"}`}
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
                                src={SPECIAL_ACHIEVEMENT_METADATA[activePreviewSpecialAchievement.key].artwork}
                                alt={`${activePreviewSpecialAchievement.title} achievement badge`}
                            />
                        </div>
                        <div className="hiddenmy-stamp-modal-details hiddenmy-special-modal-details">
                            <span>{specialAchievementStatusLabel(activePreviewSpecialAchievement)}</span>
                            <h2 id="hiddenmy-special-modal-title">
                                {activePreviewSpecialAchievement.title}
                            </h2>
                            <p className="hiddenmy-special-detail-requirement">
                                {activePreviewSpecialAchievement.requirement}
                            </p>
                            <div className="hiddenmy-special-detail-progress">
                                <div className="hiddenmy-special-progress-label">
                                    <span>Progress</span>
                                    <strong>{activePreviewSpecialAchievement.progressLabel}</strong>
                                </div>
                                <div
                                    className="hiddenmy-special-progress-track"
                                    role="progressbar"
                                    aria-label={`${activePreviewSpecialAchievement.title} detail progress`}
                                    aria-valuemin="0"
                                    aria-valuemax={activePreviewSpecialAchievement.target}
                                    aria-valuenow={activePreviewSpecialAchievement.available
                                        ? Math.min(
                                            activePreviewSpecialAchievement.progress,
                                            activePreviewSpecialAchievement.target
                                        )
                                        : 0}
                                >
                                    <span style={{ width: `${previewSpecialProgressPercent}%` }} />
                                </div>
                            </div>
                            <div className="hiddenmy-special-detail-guidance">
                                {activePreviewSpecialAchievement.available
                                    && !activePreviewSpecialAchievement.unlocked
                                    && activePreviewSpecialAchievement.remainingItems ? (
                                        <>
                                            <strong>{activePreviewSpecialAchievement.remainingItemsLabel}</strong>
                                            <p>{activePreviewSpecialAchievement.remainingItems.join(" · ")}</p>
                                        </>
                                    ) : (
                                        <p>{specialAchievementGuidance(activePreviewSpecialAchievement)}</p>
                                    )}
                            </div>
                            {favouritesLoaded && (
                                <FavouriteAchievementControl
                                    achievement={activePreviewSpecialAchievement}
                                    isFavourite={favouriteKeys.includes(activePreviewSpecialAchievement.key)}
                                    disabled={favouritesSaving}
                                    onToggle={toggleFavourite}
                                />
                            )}
                            {favouritesError && (
                                <p className="hiddenmy-favourites-message" role="status">
                                    {favouritesError}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
