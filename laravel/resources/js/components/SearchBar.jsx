import { useState, useEffect, useRef } from "react";
import { searchHiddenGems } from "../api/hiddenGems";

const DEBOUNCE_MS = 350;

function SearchBar({ onSelect }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const debounceRef = useRef(null);
    const latestRequestId = useRef(0);
    const containerRef = useRef(null);

    function handleChange(value) {
        setQuery(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (value.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        debounceRef.current = setTimeout(() => {
            runSearch(value);
        }, DEBOUNCE_MS);
    }

    async function runSearch(value) {
        const requestId = ++latestRequestId.current;

        try {
            setLoading(true);
            const res = await searchHiddenGems(value);

            if (requestId !== latestRequestId.current) return;

            const database = res.data.database || [];
            const osm = res.data.openStreetMap || [];
            setResults([...database, ...osm]);
        } catch (error) {
            if (requestId === latestRequestId.current) {
                console.log("Search error:", error);
            }
        } finally {
            if (requestId === latestRequestId.current) {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setResults([]);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function selectResult(item) {
        setQuery(item.name);
        setResults([]);
        onSelect(item);
    }

    return (
        <div className="search-container" ref={containerRef}>
            <input
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Search hidden gems or attractions..."
                className="search-input"
            />
            {loading && <p>Searching...</p>}

            {results.length > 0 && (
                <div className="search-dropdown">
                    {results.map((item, index) => (
                        <div
                            key={item.id ?? index}
                            onClick={() => selectResult(item)}
                            style={{
                                padding: "12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #ddd",
                            }}
                        >
                            {item.source === "database" ? "💎" : "📍"}{" "}
                            <b>{item.name}</b>
                            <br />
                            <small>{item.source === "database" ? "Hidden Gem" : "Attraction"}</small>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SearchBar;