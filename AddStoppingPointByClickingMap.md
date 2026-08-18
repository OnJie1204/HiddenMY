## Add Stopping Point – Select Location from Map

Currently, users can add a stopping point by searching for a location name.

Update the functionality to also allow users to:

1. Click directly on any location on the map.
2. Detect the location based on the clicked coordinates.
3. Display the selected location information.
4. Allow the user to add the selected location as a stopping point.
5. Keep the existing search-based method unchanged.
6. If the user has shared their current location, keep the existing behavior of focusing the map on their current location when the map is displayed.

## What was done

Files changed:

- `laravel/app/Http/Controllers/HiddenGemController.php` — new `reverseGeocode` endpoint.
- `laravel/routes/api.php` — new route for it.
- `laravel/resources/js/api/hiddenGems.js` — new `reverseGeocodeLocation` API helper.
- `laravel/resources/js/pages/TripItineraryDetail.jsx` — map click handling + UI.

### 1. Backend: reverse geocoding endpoint

The existing `geocode` endpoint already does forward geocoding (name → coordinates)
via Nominatim. A mirror-image `reverseGeocode` method was added
(`HiddenGemController.php`) that does coordinates → name:

```php
public function reverseGeocode(Request $request): JsonResponse
{
    // validates latitude/longitude
    // calls https://nominatim.openstreetmap.org/reverse
    // returns { id, osm_id, name, latitude, longitude, source: 'openstreetmap' }
    // 404 if Nominatim has nothing at that point, 502 if the request itself fails
}
```

Key decision: the **returned `latitude`/`longitude` are always the exact
coordinates the user clicked**, not whatever centroid Nominatim's matched
address uses — Nominatim is only consulted for a human-readable `name` and an
`osm_id`. This keeps "the selected location" faithful to where the user
actually clicked, matching requirement 2 ("detect the location based on the
clicked coordinates").

Results are cached for 6 hours per ~1m-precision coordinate (same TTL/pattern
as the existing OSM search cache) to avoid hammering Nominatim's free,
rate-limited API when a user clicks around the map.

Registered in `routes/api.php` right next to the existing `geocode` route,
inside the same `auth:sanctum` group (the Add Stopping Point flow already
requires login):

```php
Route::get('hidden-gems/reverse-geocode', [HiddenGemController::class, 'reverseGeocode']);
```

And exposed on the frontend via `hiddenGems.js`:

```js
export const reverseGeocodeLocation = (latitude, longitude) =>
    api.get('/hidden-gems/reverse-geocode', { params: { latitude, longitude } });
```

### 2. Frontend: click-to-select on the map

A `MapClickHandler` component was added next to the existing
`MapViewController`, using react-leaflet's `useMapEvents` hook to listen for
map clicks:

```jsx
function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(event) {
            onMapClick(event.latlng);
        },
    });
    return null;
}
```

It's mounted inside the same `MapContainer` used for hidden gems/search
(`<MapClickHandler onMapClick={handleMapClick} />`).

`handleMapClick` calls the new endpoint, then reuses the exact same
`selectedLocation` / `mapTarget` state that search results already populate:

```js
const handleMapClick = async (latlng) => {
    setSelectedLocation(null);
    setMapClickError("");
    setIsIdentifyingClickedLocation(true);

    try {
        const response = await reverseGeocodeLocation(latlng.lat, latlng.lng);
        const location = {
            id: response.data.id,
            osm_id: response.data.osm_id,
            name: response.data.name,
            latitude: latlng.lat,
            longitude: latlng.lng,
            source: "openstreetmap",
        };
        setSelectedLocation(location);
        setMapTarget({ ...location, zoom: 16 });
    } catch (error) {
        setMapClickError(error.response?.data?.message ?? "Unable to identify a location at this point. Please try again.");
    } finally {
        setIsIdentifyingClickedLocation(false);
    }
};
```

Because the resulting object has `source: "openstreetmap"` with `osm_id`,
`name`, `latitude`, `longitude` — the exact same shape produced by
`selectSearchResult` for an OSM search result — **no changes were needed** to:

- The marker rendering (the existing `selectedLocation?.source === "openstreetmap"`
  marker block already draws a pin at `selectedLocation`'s coordinates; a
  `Popup` showing the name and coordinates was added to it so the selected
  location's info is visible, requirement 3).
- `handleAddLocation` — it already knows how to submit an `openstreetmap`
  source location, so clicking the map and clicking a search result both
  flow through the exact same "Add" button and `POST .../locations` call
  (requirement 4).
- The "Selected: {name}" status line below the map, which already renders
  for any `selectedLocation`.

New UI additions: a hint line ("Or click anywhere on the map to select that
location") above the map, and "Identifying selected location…" /
error status lines below it (mirroring the existing hidden-gems
loading/error pattern), driven by new `isIdentifyingClickedLocation` /
`mapClickError` state. Both are reset in `closeStoppingPointDialog` so they
don't leak into the next time the dialog opens.

### Why each requirement is satisfied

1. **Click on the map** — `MapClickHandler` (via `useMapEvents`) fires
   `handleMapClick` on every map click. Leaflet markers don't bubble click
   events to the map by default, so clicking an existing hidden-gem marker,
   the user-location marker, or the selected-location marker still only
   triggers that marker's own click handler, not a reverse-geocode call.
2. **Detect location from coordinates** — the new `reverseGeocode` backend
   endpoint (Nominatim reverse lookup) resolves a name for the clicked
   `lat`/`lng`; the coordinates themselves are taken directly from the click.
3. **Display selected location info** — reuses the existing "Selected: {name}"
   text and the OSM marker, now with a `Popup` showing name + coordinates.
4. **Add as a stopping point** — reuses `selectedLocation` /
   `handleAddLocation` unchanged; the click-selected location is
   indistinguishable, at that point, from a search-selected OSM result.
5. **Search unchanged** — `searchHiddenGems`, the debounced search effect,
   `selectSearchResult`, and the search-results dropdown were not touched.
6. **User-location map focus unchanged** — `shareLocationAndOpenDialog` and
   the "focus on open" behavior added previously were not touched; clicking
   the map only ever updates `mapTarget`/`selectedLocation` in response to a
   click, same mechanism, no interference with the on-open focus.