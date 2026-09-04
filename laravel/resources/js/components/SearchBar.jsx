import { useState, useEffect, useRef } from "react";
import { searchHiddenGems } from "../api/hiddenGems";
import Spinner from "./Spinner";

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

    // Re-run the search for the text already in the box. Used by the search
    // button, the Enter key, and re-focusing the field after the results were
    // dismissed — so the user doesn't have to edit the text to see them again.
    function triggerSearch() {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.trim().length < 2) return;
        runSearch(query, { append: false });
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

    function closeResults() {
        setResults([]);
        setHasMore(false);
    }

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                closeResults();
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function selectResult(item) {
        setQuery(item.name);
        closeResults();
        onSelect(item);
    }

    return (
        <div className="search-container" ref={containerRef}>
            <input
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        triggerSearch();
                    }
                }}
                onFocus={() => {
                    if (!loading && results.length === 0 && query.trim().length >= 2) {
                        triggerSearch();
                    }
                }}
                placeholder="Search hidden gems or attractions..."
                className="search-input"
            />
            <button
                type="button"
                className="search-btn"
                onClick={triggerSearch}
                aria-label="Search"
                disabled={loading}
            >
                {loading ? <Spinner size="sm" /> : "🔍"}
            </button>

            {results.length > 0 && (
                <div className="search-dropdown">
                    <div className="search-dropdown-header">
                        <span className="search-dropdown-count">
                            {results.length}{hasMore ? "+" : ""} result{results.length === 1 ? "" : "s"}
                        </span>
                        <button
                            type="button"
                            className="search-dropdown-close"
                            onClick={closeResults}
                            aria-label="Close results"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="search-dropdown-list">
                        {results.map((item, index) => (
                            <button
                                type="button"
                                key={item.id ?? index}
                                className="search-dropdown-item"
                                onClick={() => selectResult(item)}
                            >
                                <span className="search-dropdown-item-name">{item.name}</span>
                                <span
                                    className={`search-dropdown-item-tag ${
                                        item.source === "database" ? "is-gem" : "is-osm"
                                    }`}
                                >
                                    {item.source === "database" ? "Hidden Gem" : "Attraction"}
                                </span>
                            </button>
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
                </div>
            )}
        </div>
    );
}

export default SearchBar;
