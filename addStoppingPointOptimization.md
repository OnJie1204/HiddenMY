# Update Add Stopping Point Function

Change the **Add Stopping Point** function on the **Itinerary Details** page.

### Current Search Algorithm

The current search algorithm should remain unchanged:

1. Search for matching **Hidden Gems** from the database first.
2. Display the matching **Hidden Gems** first.
3. If there are not enough Hidden Gem results, search **OpenStreetMap (OSM)** for additional results.
4. Display the OSM results after the Hidden Gem results.

### Add User Location

Add optional location-based searching:

- When the user clicks **Add Stopping Point**, ask whether they want to provide their current location.
- Providing the location should **not be mandatory**.
- If the user allows location access:
  - Use the user's location to prioritize/show nearby search results.
  - **Hidden Gems must still be searched and displayed first.**
  - Only after the Hidden Gem results are retrieved should OSM be searched for additional results.
  - OSM results should be sorted/relevant based on proximity to the user's location.
- If the user does not provide their location:
  - Perform the existing **basic search**.
  - Keep the existing priority: **Hidden Gems first → OSM second**.

### Final Search Priority

The search flow should remain:

**Hidden Gems → OSM**

With optional location support:

**Hidden Gems → Nearby OSM results**

If no location is provided:

**Hidden Gems → Normal OSM results**

---

## Implementation Summary

### Backend — `laravel/app/Http/Controllers/HiddenGemController.php`

- `search()` now accepts optional `latitude` / `longitude` query params (validated as numeric, within `-90..90` / `-180..180`). Hidden Gem lookup is unchanged and still runs first regardless of location.
- `searchOpenStreetMap()` / `fetchFromNominatim()` now take optional `$latitude` / `$longitude`:
  - When provided, the Nominatim request is biased toward the user with a soft (`bounded=0`) `viewbox` of roughly ±0.5° (~55 km) around the coordinates, and fetches extra candidates to sort from.
  - Results are then sorted by great-circle distance (new `distanceInKm()` helper, Haversine formula) before trimming to the remaining slot count.
  - When no location is provided, behavior is identical to before (plain Nominatim query, no sorting).
- The OSM result cache key now includes the (rounded-in-effect) lat/lng so cached results don't leak between different user locations for the same query.

### Frontend API — `laravel/resources/js/api/hiddenGems.js`

- `searchHiddenGems(query, { signal, latitude, longitude })` now forwards `latitude`/`longitude` as query params and correctly passes the `AbortSignal` to axios (previously the signal argument was accepted but silently dropped, so in-flight searches were never actually cancelled).

### Frontend UI — `laravel/resources/js/pages/TripItineraryDetail.jsx`

- Clicking **+ Add Stopping Point** no longer opens the search dialog directly. It now calls `openAddStoppingPointFlow()`, which opens a small "Use your current location?" prompt (skipped straight to the search dialog if the browser has no Geolocation API).
- The prompt has two actions:
  - **Skip** — proceeds with no location (`userLocation = null`), preserving the original Hidden Gems → normal OSM behavior.
  - **Share Location** — calls `navigator.geolocation.getCurrentPosition()`; on success stores `{ latitude, longitude }` in `userLocation` and opens the search dialog; on failure/denial shows an inline error and lets the user skip instead.
- The debounced location-search effect now passes `userLocation`'s coordinates into `searchHiddenGems` and re-runs when `userLocation` changes.
- The search dialog shows a small "📍 Showing OpenStreetMap results nearest to your current location first" note when a location was shared.
- `closeStoppingPointDialog()` resets `userLocation` so the user is asked again next time they open the dialog.
- New state: `isLocationPromptOpen`, `userLocation`, `isRequestingLocation`, `locationPromptError`.

### Styles — `laravel/resources/js/styles/global.css`

- Added `.location-prompt-dialog` (narrower width) and `.location-prompt-description` for the new prompt; it otherwise reuses the existing `.stopping-point-dialog` / `.stopping-point-dialog-actions` classes so no other styling was needed.

### Verification

- `php -l app/Http/Controllers/HiddenGemController.php` — no syntax errors.
- `npx vite build` — frontend build succeeds with no errors.
- Not manually tested in-browser (no dev server run as part of this task); logic was traced through both the "share location" and "skip" paths.