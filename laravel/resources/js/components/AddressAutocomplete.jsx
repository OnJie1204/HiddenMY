import { useEffect, useRef, useState } from "react";
import { autocompleteAddress } from "../features/hidden-gems/api";

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

/**
 * Google-Maps-style address type-ahead, backed by the Photon geocoder
 * (see HiddenGemController::addressAutocomplete). Free-text is always
 * allowed — the suggestions are a convenience, not a requirement.
 *
 * Props:
 *   value        current address string (controlled)
 *   onChange(text)        called on every keystroke
 *   onSelect(suggestion)  called when a suggestion is chosen; suggestion is
 *                         { label, address, state, postcode, latitude, longitude }
 *   latitude, longitude   optional bias for ranking (the pin already placed)
 *   plus the usual input props: name, placeholder, required, className, id
 */
export default function AddressAutocomplete({
    value,
    onChange,
    onSelect,
    latitude,
    longitude,
    name = "address",
    placeholder = "Address",
    required = false,
    className = "form-input",
    id,
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [noResults, setNoResults] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);
    const abortRef = useRef(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function runSearch(query) {
        const trimmed = query.trim();

        if (trimmed.length < MIN_CHARS) {
            setSuggestions([]);
            setLoading(false);
            setError("");
            setNoResults(false);
            return;
        }

        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;

        setLoading(true);
        setError("");
        setNoResults(false);

        autocompleteAddress(trimmed, {
            signal: controller.signal,
            latitude,
            longitude,
        })
            .then((res) => {
                if (requestId !== requestIdRef.current) return;
                const list = res.data?.data ?? [];
                setSuggestions(list);
                setNoResults(list.length === 0);
                setActiveIndex(-1);
                setOpen(true);
            })
            .catch((err) => {
                if (requestId !== requestIdRef.current) return;
                if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
                setSuggestions([]);
                setError(
                    err?.response?.status === 502
                        ? "Suggestions are unavailable — type the address and use the map below."
                        : "Couldn't load suggestions."
                );
                setOpen(true);
            })
            .finally(() => {
                if (requestId === requestIdRef.current) setLoading(false);
            });
    }

    function handleInput(event) {
        const text = event.target.value;
        onChange(text);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
    }

    function choose(suggestion) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setOpen(false);
        setSuggestions([]);
        setActiveIndex(-1);
        onSelect(suggestion);
    }

    function handleKeyDown(event) {
        if (!open || suggestions.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        } else if (event.key === "Enter") {
            // Don't let the first Enter submit the form while the list is open.
            event.preventDefault();
            if (activeIndex >= 0) choose(suggestions[activeIndex]);
            else setOpen(false);
        } else if (event.key === "Escape") {
            setOpen(false);
        }
    }

    // Keep showing stale results while a refinement loads (bar sits on top);
    // only surface the "no results" / error lines once loading has settled.
    const showDropdown =
        open && (suggestions.length > 0 || (!loading && (error || noResults)));

    return (
        <div className="address-autocomplete" ref={wrapperRef}>
            <input
                id={id}
                className={className}
                name={name}
                placeholder={placeholder}
                value={value}
                required={required}
                autoComplete="off"
                role="combobox"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                aria-busy={loading}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (suggestions.length > 0 || error) setOpen(true);
                }}
            />

            {loading && (
                <div className="address-autocomplete-loading" aria-hidden="true">
                    <div className="address-autocomplete-loading-indicator" />
                </div>
            )}

            {showDropdown && (
                <div className="address-autocomplete-dropdown" role="listbox">
                    {!loading && error && (
                        <div className="address-autocomplete-status">{error}</div>
                    )}

                    {!loading && !error && noResults && suggestions.length === 0 && (
                        <div className="address-autocomplete-status">
                            No matching addresses — you can type it in manually.
                        </div>
                    )}

                    {suggestions.map((suggestion, index) => (
                        <button
                            type="button"
                            key={`${suggestion.label}-${index}`}
                            className="address-autocomplete-option"
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(suggestion)}
                        >
                            <span className="address-autocomplete-option-main">
                                {suggestion.address || suggestion.label}
                            </span>
                            {(suggestion.state || suggestion.postcode) && (
                                <span className="address-autocomplete-option-meta">
                                    {[suggestion.state, suggestion.postcode]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
