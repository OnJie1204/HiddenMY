import { useState, useEffect, useRef } from "react";
import { searchHiddenGems } from "../api/hiddenGems";

const DEBOUNCE_MS = 350;

function SearchBar({ onSelect, userLatitude, userLongitude }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    const debounceRef = useRef(null);
    const latestRequestId = useRef(0);
    const containerRef = useRef(null);
    // Pagination cursors for "load more" — see HiddenGemController::search().
    // Not state: they don't drive a render on their own, only via hasMore/results.
    const offsetsRef = useRef({ dbOffset: 0, osmOffset: 0 });

    function handleChange(value) {
        setQuery(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (value.length < 2) {
            setResults([]);
            setHasMore(false);
            setLoading(false);
            return;
        }

        debounceRef.current = setTimeout(() => {
            runSearch(value, { append: false });
        }, DEBOUNCE_MS);
    }

    async function runSearch(value, { append }) {
        const requestId = ++latestRequestId.current;

        try {
            append ? setLoadingMore(true) : setLoading(true);

            const { dbOffset, osmOffset } = append ? offsetsRef.current : { dbOffset: 0, osmOffset: 0 };
            const res = await searchHiddenGems(value, {
                dbOffset,
                osmOffset,
                latitude: userLatitude,
                longitude: userLongitude,
            });

            if (requestId !== latestRequestId.current) return;

            const database = res.data.database || [];
            const osm = res.data.openStreetMap || [];
            const page = [...database, ...osm];

            setResults(prev => (append ? [...prev, ...page] : page));
            setHasMore(!!res.data.hasMore);
            offsetsRef.current = {
                dbOffset: res.data.nextDbOffset ?? 0,
                osmOffset: res.data.nextOsmOffset ?? 0,
            };
        } catch (error) {
            if (requestId === latestRequestId.current) {
                console.log("Search error:", error);
            }
        } finally {
            if (requestId === latestRequestId.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }

    function loadMore() {
        if (loadingMore || !hasMore) return;
        runSearch(query, { append: true });
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
                setHasMore(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function selectResult(item) {
        setQuery(item.name);
        setResults([]);
        setHasMore(false);
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
                                borderBottom: "1px solid #E5E7EB",
                            }}
                        >
                            <b>{item.name}</b>
                            <br />
                            <small>{item.source === "database" ? "Hidden Gem" : "Attraction"}</small>
                        </div>
                    ))}

                    {hasMore && (
                        <button
                            type="button"
                            className="search-load-more-btn"
                            onClick={loadMore}
                            disabled={loadingMore}
                        >
                            {loadingMore ? "Loading…" : "Load more results"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default SearchBar;
