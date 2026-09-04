import { useState } from "react";
import SearchBar from "./SearchBar";
import { getTripItinerary } from "../api/TripItinerary";

// Edits a travel post's frozen trip snapshot. Stops can be seeded from any of
// the author's itineraries (their stops merged in, deduped) and/or added by
// hand, then reordered / captioned / removed. The parent owns `stops`; each
// stop is:
//   { key, kind: 'gem'|'osm', location_id?, osm_id?, osm_name?, name,
//     latitude?, longitude?, caption, source_itinerary_id? }
let seq = 0;
const nextKey = () => `s${Date.now()}_${seq++}`;

function dedupeKey(stop) {
    if (stop.location_id) return `g:${stop.location_id}`;
    if (stop.osm_id) return `o:${stop.osm_id}`;
    return `c:${Number(stop.latitude).toFixed(5)},${Number(stop.longitude).toFixed(5)}`;
}

export default function TripStopsEditor({ stops, setStops, itineraries = [] }) {
    const [pickTrip, setPickTrip] = useState("");
    const [loadingTrip, setLoadingTrip] = useState(false);
    const [note, setNote] = useState("");

    const has = (candidate) => {
        const k = dedupeKey(candidate);
        return stops.some((s) => dedupeKey(s) === k);
    };

    const append = (incoming) => {
        const fresh = incoming.filter((s) => !has(s)).map((s) => ({ ...s, key: nextKey() }));
        if (fresh.length) setStops([...stops, ...fresh]);
        return fresh.length;
    };

    async function addFromItinerary(id) {
        if (!id) return;
        setLoadingTrip(true);
        setNote("");
        try {
            const res = await getTripItinerary(id);
            const rows = res.data?.data?.locations || [];
            const mapped = rows.map((row) =>
                row.isHidden && row.location
                    ? {
                          kind: "gem",
                          location_id: row.location.id,
                          name: row.location.place_name,
                          gem_status: row.location.status,
                          caption: "",
                          source_itinerary_id: Number(id),
                      }
                    : {
                          kind: "osm",
                          osm_id: row.osm_id ?? null,
                          osm_name: row.osm_name || "Place",
                          name: row.osm_name || "Place",
                          latitude: row.latitude,
                          longitude: row.longitude,
                          caption: "",
                          source_itinerary_id: Number(id),
                      }
            );
            const added = append(mapped);
            setNote(
                added === 0
                    ? "Every stop from that trip is already in the list."
                    : `Added ${added} stop${added === 1 ? "" : "s"} from that trip.`
            );
        } catch {
            setNote("Could not load that trip.");
        } finally {
            setLoadingTrip(false);
            setPickTrip("");
        }
    }

    function addFromSearch(item) {
        const stop =
            item.source === "database"
                ? { kind: "gem", location_id: item.id, name: item.name, gem_status: item.status, caption: "" }
                : {
                      kind: "osm",
                      osm_id: item.osm_id ?? null,
                      osm_name: item.name,
                      name: item.name,
                      latitude: item.latitude,
                      longitude: item.longitude,
                      caption: "",
                  };

        if (stop.kind === "osm" && (stop.latitude == null || stop.longitude == null)) {
            setNote("That result has no location and can't be added as a stop.");
            return;
        }
        const added = append([stop]);
        setNote(added === 0 ? "That stop is already in the list." : "");
    }

    const move = (index, dir) => {
        const target = index + dir;
        if (target < 0 || target >= stops.length) return;
        const copy = [...stops];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        setStops(copy);
    };

    const remove = (key) => setStops(stops.filter((s) => s.key !== key));

    const setCaption = (key, caption) =>
        setStops(stops.map((s) => (s.key === key ? { ...s, caption } : s)));

    return (
        <div className="trip-stops-editor">
            {itineraries.length > 0 && (
                <div className="trip-stops-editor-row">
                    <select
                        className="form-input"
                        value={pickTrip}
                        onChange={(e) => {
                            setPickTrip(e.target.value);
                            addFromItinerary(e.target.value);
                        }}
                        disabled={loadingTrip}
                    >
                        <option value="">
                            {loadingTrip ? "Adding stops…" : "Add stops from one of your trips…"}
                        </option>
                        {itineraries.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                                {trip.trip_name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <SearchBar onSelect={addFromSearch} />
            {note && <p className="trip-stops-editor-note">{note}</p>}

            {stops.length > 0 && (
                <ol className="trip-stops-editor-list">
                    {stops.map((stop, index) => (
                        <li key={stop.key} className="trip-stops-editor-item">
                            <span className="trip-stops-editor-rank">{index + 1}</span>
                            <div className="trip-stops-editor-body">
                                <div className="trip-stops-editor-head">
                                    <span className="trip-stops-editor-name">{stop.name}</span>
                                    <span className="trip-stops-editor-kind">
                                        {stop.kind !== "gem"
                                            ? "Place"
                                            : stop.gem_status === "pending_community_vote"
                                                ? "In community voting"
                                                : stop.gem_status === "well_known"
                                                    ? "Well-known place"
                                                    : "Hidden gem"}
                                    </span>
                                    {stop.source_itinerary_id && (
                                        <span className="trip-stops-editor-kind">from a trip</span>
                                    )}
                                </div>
                                <input
                                    className="form-input"
                                    placeholder="Caption (optional)"
                                    value={stop.caption || ""}
                                    onChange={(e) => setCaption(stop.key, e.target.value)}
                                    maxLength={255}
                                />
                            </div>
                            <div className="trip-stops-editor-actions">
                                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Move up">▲</button>
                                <button type="button" onClick={() => move(index, 1)} disabled={index === stops.length - 1} title="Move down">▼</button>
                                <button type="button" onClick={() => remove(stop.key)} title="Remove" className="trip-stops-editor-remove">×</button>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

// Serialise the editor's stop list into FormData entries the API expects.
export function appendStopsToFormData(formData, stops) {
    stops.forEach((stop, i) => {
        if (stop.location_id) formData.append(`stops[${i}][location_id]`, stop.location_id);
        if (stop.osm_id) formData.append(`stops[${i}][osm_id]`, stop.osm_id);
        if (stop.osm_name) formData.append(`stops[${i}][osm_name]`, stop.osm_name);
        if (stop.latitude != null) formData.append(`stops[${i}][latitude]`, stop.latitude);
        if (stop.longitude != null) formData.append(`stops[${i}][longitude]`, stop.longitude);
        if (stop.caption) formData.append(`stops[${i}][caption]`, stop.caption);
        if (stop.source_itinerary_id) formData.append(`stops[${i}][source_itinerary_id]`, stop.source_itinerary_id);
    });
}
