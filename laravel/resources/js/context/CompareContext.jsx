import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toCompareGem, MAX_COMPARE } from "../utils/compareGem";

const STORAGE_KEY = "hiddenmy-compare-gems";
const CompareContext = createContext(null);

function loadStored() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function CompareProvider({ children }) {
    const [items, setItems] = useState(loadStored);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // Storage full/unavailable — comparison just won't survive a refresh.
        }
    }, [items]);

    const isComparing = useCallback((id) => items.some((g) => g.id === id), [items]);

    const canAddMore = items.length < MAX_COMPARE;

    const toggleCompare = useCallback((raw) => {
        const gem = toCompareGem(raw);
        setItems((prev) => {
            if (prev.some((g) => g.id === gem.id)) {
                return prev.filter((g) => g.id !== gem.id);
            }
            if (prev.length >= MAX_COMPARE) return prev;
            return [...prev, gem];
        });
    }, []);

    const removeCompare = useCallback((id) => {
        setItems((prev) => prev.filter((g) => g.id !== id));
    }, []);

    const clearCompare = useCallback(() => setItems([]), []);

    const value = { items, isComparing, toggleCompare, removeCompare, clearCompare, canAddMore, maxCompare: MAX_COMPARE };

    return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
    const ctx = useContext(CompareContext);
    if (!ctx) {
        throw new Error("useCompare must be used within a CompareProvider");
    }
    return ctx;
}
