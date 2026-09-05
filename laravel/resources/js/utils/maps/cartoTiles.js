const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;

export function cartoTileUrl(style) {
    const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
    return CARTO_API_KEY ? `${base}?key=${CARTO_API_KEY}` : base;
}
