import L from "leaflet";

export function createGemClusterIcon(cluster) {
    const count = cluster.getChildCount();

    let size = 40;
    if (count >= 50) size = 56;
    else if (count >= 10) size = 48;

    return L.divIcon({
        html: `
            <div class="gem-cluster" style="width:${size}px;height:${size}px">
                <img src="/images/gem_marker.png" style="width:${size}px;height:${size}px"/>
                <span>${count}</span>
            </div>
        `,
        className: "", // prevents Leaflet's default divIcon white box/border from showing through
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
    });
}