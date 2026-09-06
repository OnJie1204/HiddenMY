import L from "leaflet";

const CATEGORIES = [
    {
        types: ["restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream"],
        emoji: "🍽️",
        color: "#f97316",
    },
    {
        types: ["cinema", "theatre", "marketplace"],
        emoji: "🎭",
        color: "#8b5cf6",
    },
    {
        types: ["attraction", "museum", "viewpoint", "gallery", "zoo", "theme_park", "artwork", "aquarium", "picnic_site"],
        emoji: "🎡",
        color: "#ec4899",
    },
    {
        types: ["park", "garden", "nature_reserve", "water_park", "beach_resort", "beach", "peak", "cave_entrance"],
        emoji: "🌳",
        color: "#22c55e",
    },
    {
        types: ["monument", "memorial", "ruins", "castle", "archaeological_site", "temple"],
        emoji: "🏛️",
        color: "#92400e",
    },
    {
        types: ["mall", "department_store"],
        emoji: "🛍️",
        color: "#3b82f6",
    },
];

const DEFAULT_CATEGORY = { emoji: "📍", color: "#64766f" };

function styleFor(type) {
    if (!type) return DEFAULT_CATEGORY;
    return CATEGORIES.find(c => c.types.includes(type)) || DEFAULT_CATEGORY;
}

const iconCache = new Map();

export function createAttractionIcon(type) {
    const key = type || "__default__";
    if (iconCache.has(key)) return iconCache.get(key);

    const { emoji, color } = styleFor(type);
    const icon = L.divIcon({
        html: `
            <div class="attraction-marker-pin" style="background:${color}">
                <span>${emoji}</span>
            </div>
        `,
        className: "", 
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28],
    });

    iconCache.set(key, icon);
    return icon;
}
