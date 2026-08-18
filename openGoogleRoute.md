## Open Routes in Google Maps

Now that all the stopping points can be saved correctly, I want to implement the **"Open Routes in Google Maps"** button.

The function should work as follows:

1. The user's **current location** should be used as the **starting point**.
2. All saved **stopping points** in the itinerary should become destinations/stops in Google Maps.
3. The stopping points must follow the **same order** as they appear in the itinerary.
4. The route should therefore be:

   **User's Current Location → Stopping Point 1 → Stopping Point 2 → Stopping Point 3 → ...**

5. When the user clicks **"Open Routes in Google Maps"**, Google Maps should open with the complete route and all stopping points already included.
6. The stopping points can come from either:
   - Hidden Gems stored in the database
   - Locations obtained from OpenStreetMap

The implementation should use the latitude and longitude of each stopping point to ensure Google Maps navigates to the correct locations.

---

## Implementation

### Problem found
Stopping points added from **OpenStreetMap** were only ever saved with `osm_id` / `osm_name` — their latitude/longitude were never persisted to the database. Hidden Gem stops didn't have this problem, since their coordinates are always available through the related `locations` row. This had to be fixed first, otherwise OSM stops could not be routed.

### Changes made

**Database**
- `laravel/database/migrations/2026_08_12_130704_add_coordinates_to_trip_locations_table.php` — added nullable `latitude`/`longitude` columns to `trip_locations` (used only for OSM stops; Hidden Gem stops keep using the coordinates from their linked `Location`). Migration has been run.
- `laravel/app/Models/TripLocation.php` — added `latitude`/`longitude` to `$fillable`.

**Backend**
- `laravel/app/Http/Controllers/TripItineraryController.php` (`storeLocation`) — now validates and stores `latitude`/`longitude` (required, numeric, in valid range) whenever a stop is added from `openstreetmap`.

**Frontend (`laravel/resources/js/pages/TripItineraryDetail.jsx`)**
- `handleAddLocation` now sends `latitude`/`longitude` (from the selected OpenStreetMap search result) when saving an OSM stop.
- `toDisplayLocation` now also exposes `latitude`/`longitude` for every stop in the list — pulled from `location.location` (Hidden Gem) or the stop's own columns (OSM) — so the ordered `locations` state has everything needed to build a route.
- Implemented `handleOpenRouteInGoogleMaps`, wired to the existing **"Open Route in Google Maps"** button:
  1. Filters the itinerary's stops to those with valid coordinates.
  2. Uses `navigator.geolocation.getCurrentPosition` to get the user's current location as the route's starting point.
  3. Builds a Google Maps Directions URL (`https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...&travelmode=driving`), where:
     - `origin` = the user's current coordinates,
     - `waypoints` = all stops except the last, in itinerary order, pipe (`|`)-separated,
     - `destination` = the last stop in the itinerary.
  4. Opens the URL in a new tab via `window.open`.
  5. Shows an inline error message if geolocation fails/is denied, or if there are no stops with usable coordinates, without blocking the rest of the page.

### Result
Clicking **"Open Route in Google Maps"** now opens Google Maps with a full route: **current location → stop 1 → stop 2 → … → last stop**, in the same order shown in the itinerary, regardless of whether each stop came from Hidden Gems or OpenStreetMap.