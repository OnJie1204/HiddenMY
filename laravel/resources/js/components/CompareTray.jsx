import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompare } from "../context/CompareContext";
import GemImage from "./GemImage";

function CompareTray() {
    const { items, removeCompare, clearCompare, maxCompare } = useCompare();
    const [expanded, setExpanded] = useState(false);
    const navigate = useNavigate();

    if (items.length === 0) return null;

    function handleCompareNow() {
        navigate(`/compare?ids=${items.map((g) => g.id).join(",")}`);
    }

    return (
        <div className={`compare-tray ${expanded ? "compare-tray-expanded" : ""}`}>
            {expanded && (
                <div className="compare-tray-panel">
                    <div className="compare-tray-header">
                        <h3>Compare ({items.length}/{maxCompare})</h3>
                        <button type="button" className="compare-tray-clear" onClick={clearCompare}>
                            Clear
                        </button>
                    </div>
                    <div className="compare-tray-list">
                        {items.map((gem) => (
                            <div key={gem.id} className="compare-tray-item">
                                <GemImage src={gem.image} alt={gem.title} className="compare-tray-item-image" />
                                <span className="compare-tray-item-title">{gem.title}</span>
                                <button
                                    type="button"
                                    className="compare-tray-item-remove"
                                    onClick={() => removeCompare(gem.id)}
                                    aria-label={`Remove ${gem.title} from comparison`}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="compare-tray-compare-btn"
                        onClick={handleCompareNow}
                        disabled={items.length < 2}
                        title={items.length < 2 ? "Add at least 2 gems to compare" : undefined}
                    >
                        Compare Now →
                    </button>
                </div>
            )}

            <button
                type="button"
                className="compare-tray-tab"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? "Minimize comparison tray" : "Open comparison tray"}
                title={expanded ? "Minimize" : "View comparison selection"}
            >
                <span className="compare-tray-tab-count">{items.length}</span>
                <span className="compare-tray-tab-label">Compare</span>
            </button>
        </div>
    );
}

export default CompareTray;
