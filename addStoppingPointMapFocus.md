## Add Stopping Point – Focus on User Location

When the user clicks **Add Stopping Point** and has already chosen to share their current location:

1. Keep the existing user location-sharing functionality unchanged.
2. When the map is displayed, automatically move the map focus/center to the user's current location.
3. Keep the existing search results and searching algorithm unchanged.
4. If the user does not share their location, keep the existing map behavior unchanged.

## What was done

File changed: `laravel/resources/js/pages/TripItineraryDetail.jsx`

The stopping-point map already had a `mapTarget` piece of state that drives a
`MapViewController` component (`map.flyTo(...)` on change) — it's the same
mechanism used to pan/zoom the map when a search result is selected.

In `shareLocationAndOpenDialog` (the geolocation success callback, i.e. the
path taken only when the user shares their location), the resolved
coordinates are now also pushed into `mapTarget` (zoom level 13) right after
`userLocation` is set:

```js
navigator.geolocation.getCurrentPosition(
    (position) => {
        const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        };
        setUserLocation(location);
        setMapTarget({ ...location, zoom: 13 }); // new: focus map on user location
        setIsRequestingLocation(false);
        setIsLocationPromptOpen(false);
        setIsStoppingPointDialogOpen(true);
    },
    ...
);
```

Because `MapViewController` already reacts to `mapTarget` changes and calls
`map.flyTo`, the Leaflet map now flies to the user's location as soon as the
Add Stopping Point dialog opens — no changes were needed to the map
rendering, markers, or the `MapViewController` component itself.

Why this satisfies each requirement:

- **(1) Location sharing unchanged** — `shareLocationAndOpenDialog` still
  requests geolocation and sets `userLocation` exactly as before; only one
  extra `setMapTarget` call was added.
- **(2) Map auto-focuses on user location** — setting `mapTarget` triggers
  the existing `flyTo` effect, centering the map on the user's coordinates
  the moment the dialog/map is shown.
- **(3) Search unchanged** — `selectSearchResult` still sets `mapTarget`
  itself when a result is picked (overwriting the initial focus), and the
  search/debounce effect that calls `searchHiddenGems` with
  `userLocation.latitude/longitude` was not touched.
- **(4) No location shared → unchanged behavior** — `skipLocationAndOpenDialog`
  (and the no-`navigator.geolocation` fallback in
  `openAddStoppingPointFlow`) never set `userLocation` or `mapTarget`, so the
  map keeps its original default center/zoom (`[4.2105, 101.9758]`, zoom 6)
  exactly as before.
- Closing the dialog (`closeStoppingPointDialog`) already reset both
  `userLocation` and `mapTarget` to `null`, so each new dialog open starts
  from a clean state and re-applies this focus logic only when location was
  actually shared for that session.

## Follow-up: marker for the user's current location

In addition to panning the map, a visible marker (pin) is now placed at the
user's current location when it has been shared, so it's not just the map
center that moves — the user can actually see a "you are here" point.

Files changed:

- `laravel/resources/js/pages/TripItineraryDetail.jsx`
- `laravel/resources/js/styles/global.css`

**1. New marker icon** (`TripItineraryDetail.jsx`), defined next to the
existing `hiddenGemMarkerIcon` / `openStreetMapMarkerIcon` divIcons:

```js
const userLocationMarkerIcon = L.divIcon({
    className: "user-location-marker-icon",
    html: '<span class="user-location-marker-pulse" aria-hidden="true"></span><span class="user-location-marker-dot" aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});
```

It renders as a solid blue dot with an animated pulsing ring around it, the
same "you are here" pattern used by most map UIs, visually distinct from the
diamond hidden-gem markers and the teardrop OpenStreetMap marker.

**2. Marker rendered on the map**, inside the same `MapContainer` used for
hidden gems and search results, guarded by `userLocation` being set and
valid:

```jsx
{userLocation && hasValidCoordinates(userLocation) && (
    <Marker
        position={[Number(userLocation.latitude), Number(userLocation.longitude)]}
        icon={userLocationMarkerIcon}
    >
        <Tooltip>Your current location</Tooltip>
    </Marker>
)}
```

The label uses react-leaflet's `Tooltip` rather than `Popup`. `Popup`
(used by the hidden-gem markers, where clicking selects that gem) only
opens on click; `Tooltip` opens on hover (`mouseover`) and closes on
`mouseout` by default, with no extra event wiring needed — so hovering the
"you are here" marker shows the "Your current location" label without
requiring a click, and without affecting the click-to-select behavior of
the other markers.

Because it reuses `userLocation` (only ever set in
`shareLocationAndOpenDialog`, and cleared in `closeStoppingPointDialog`),
the marker automatically follows the same rules as the map-focus feature
above:

- Shown only when the user actually shared their location.
- Not shown when the user skips sharing (`skipLocationAndOpenDialog`) or
  when geolocation isn't available — no behavior change for that path.
- Cleared whenever the dialog closes, so it never lingers into the next
  session.

**3. CSS** (`global.css`), added alongside the other marker styles
(`.hidden-gem-marker-*`, `.open-street-map-marker*`):

```css
.user-location-marker-icon { background: transparent; border: 0; position: relative; }
.user-location-marker-dot { /* solid blue dot, centered on the icon anchor */ }
.user-location-marker-pulse { /* translucent ring that scales/fades via @keyframes user-location-pulse */ }
```

The pulse is a pure-CSS `@keyframes` animation (scale + fade, 1.8s loop),
no extra JS or libraries required.