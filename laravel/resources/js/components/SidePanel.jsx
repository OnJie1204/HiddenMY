import { useEffect, useRef, useState } from "react";
import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

function SidePanel({ group, onClose }) {
    const [activeGem, setActiveGem] = useState(null);
    const [width, setWidth] = useState(400);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef(null);

    useEffect(() => {
        setActiveGem(group && group.length === 1 ? group[0] : null);
        setIsFullscreen(false);
    }, [group]);

    // Drag-to-resize
    useEffect(() => {
        if (!isResizing) return;

        function handleMouseMove(e) {
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            setWidth(newWidth);
        }
        function handleMouseUp() {
            setIsResizing(false);
        }

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isResizing]);

    // Press 'esc' to close panel 
    useEffect(() => {
        if (!group) return; 

        function handleEscape(e) {
            if (e.key === "Escape") {
                onClose();
            }
        }

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [group, onClose]);

    if (!group) return null;

    const showList = group.length > 1 && !activeGem;
    const gem = activeGem;

    function openGoogleMaps(g) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`, "_blank");
    }
    function openWaze(g) {
        window.open(`https://www.waze.com/ul?ll=${g.latitude},${g.longitude}&navigate=yes`, "_blank");
    }

    return (
        <div
            ref={panelRef}
            className={`side-sheet open ${isFullscreen ? "fullscreen" : ""} ${isResizing ? "resizing" : ""}`}
            style={!isFullscreen ? { width: `${width}px` } : undefined}
        >
            <div className="side-sheet-topbar">
                <button
                    className="side-sheet-icon-btn"
                    onClick={() => setIsFullscreen(f => !f)}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                    {isFullscreen ? "⤡" : "⤢"}
                </button>
                <button className="side-sheet-icon-btn" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className="side-sheet-body">
                {showList && (
                    <>
                        <h2>{group.length} posts at this spot</h2>
                        {group.map((g, i) => (
                            <div key={g.id ?? i} className="post-list-item" onClick={() => setActiveGem(g)}>
                                {g.image && <img src={g.image} alt={g.title} />}
                                <div>
                                    <strong>{g.title}</strong>
                                    <p>{g.category}</p>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {gem && (
                    <>
                        {group.length > 1 && (
                            <button className="side-sheet-back" onClick={() => setActiveGem(null)}>
                                ← Back to posts
                            </button>
                        )}

                        <div className="bottom-sheet-header">
                            {gem.image && <img src={gem.image} alt={gem.title} className="bottom-sheet-image" />}
                            <div className="bottom-sheet-badges">
                                {gem.category && <span className="badge badge-neutral">{gem.category}</span>}
                                {gem.source === "database" && (
                                    <span className="badge badge-success"><i className="ti ti-check" /> Verified</span>
                                )}
                            </div>
                        </div>

                        <h2>{gem.source === "database" ? "💎" : "📍"} {gem.title}</h2>
                        {gem.state && <p className="bottom-sheet-meta">📍 {gem.state}</p>}
                        <p>{gem.description || "No description available."}</p>

                        {gem.address && (
                            <>
                                <h4>Address</h4>
                                <p>{gem.address}</p>
                            </>
                        )}

                        <div className="action-buttons-row">
                            <button className="map-action-tile" onClick={() => openGoogleMaps(gem)} aria-label="Open in Google Maps">
                                <img src={googleMapsIcon} alt="Google Maps" />
                            </button>
                            <button className="map-action-tile" onClick={() => openWaze(gem)} aria-label="Open in Waze">
                                <img src={wazeIcon} alt="Waze" />
                            </button>
                            <button className="map-action-tile itinerary">Add to Itinerary</button>
                        </div>

                        {gem.source === "database" && gem.voteCount != null && (
                            <div className="vote-progress">
                                <span>{gem.voteCount} of {gem.verificationThreshold ?? 10} votes to verify</span>
                                <div className="vote-bar">
                                    <div className="vote-fill" style={{ width: `${Math.min(100, (gem.voteCount / (gem.verificationThreshold ?? 10)) * 100)}%` }} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {!isFullscreen && (
                <div
                    className="side-sheet-resize-handle"
                    onMouseDown={() => setIsResizing(true)}
                />
            )}
        </div>
    );
}

export default SidePanel;