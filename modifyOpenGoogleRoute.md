## Open Routes in Google Maps

Modify the **"Open Routes in Google Maps"** function with the following behavior:

1. All saved **stopping points** in the itinerary should be added to Google Maps as **stops/waypoints**.
2. The stopping points must follow the **same order** as they appear in the itinerary.
3. The **starting location should be left empty**.
4. Do **not** request or retrieve the user's current location.
5. Let **Google Maps automatically handle the starting location** based on the user's current location.
6. The route should be:

   **Current Location → Stopping Point 1 → Stopping Point 2 → Stopping Point 3 → ...**

7. When the user clicks **"Open Routes in Google Maps"**, Google Maps should open with all stopping points already populated in the correct order.
8. The stopping points can come from:
   - Hidden Gems stored in the database
   - Locations obtained from OpenStreetMap
9. Use the **latitude and longitude** of each stopping point when constructing the Google Maps route to ensure each location is correctly identified.

---

## Implementation

### What changed
The previous implementation (see `openGoogleRoute.md`) called `navigator.geolocation.getCurrentPosition` to fetch the user's current location and passed it as the `origin` of the Google Maps Directions URL. That is exactly what this change removes.

**File modified:** `laravel/resources/js/pages/TripItineraryDetail.jsx`

- **`handleOpenRouteInGoogleMaps` no longer calls `navigator.geolocation`.** The geolocation permission prompt/lookup and its browser-support/error-handling branches were removed entirely.
- **The `origin` parameter is no longer included in the Google Maps URL.** With `origin` omitted, Google Maps treats the starting point as unset and resolves it itself using the user's current location inside Maps — matching "let Google Maps automatically handle the starting location."
- **All stops still populate the route in itinerary order**, unchanged from before:
  - Stops are filtered to those with valid `latitude`/`longitude` (works for both Hidden Gem and OpenStreetMap stops, since both now carry coordinates).
  - The **last** stop becomes `destination`.
  - Every stop **before** the last becomes a `|`-separated `waypoints` entry, in order.
- Removed the `isOpeningRoute` loading state (and the button's "Locating you…" label/disabled state) since the handler is now synchronous — there is no longer an async geolocation call to wait on.
- Kept the `routeError` message for the one remaining failure case: no stops in the itinerary have usable coordinates.

### Resulting URL shape
```
https://www.google.com/maps/dir/?api=1&destination=<lastStopLat>,<lastStopLng>&waypoints=<stop1Lat>,<stop1Lng>|<stop2Lat>,<stop2Lng>|...&travelmode=driving
```
No `origin` parameter is sent, so Google Maps starts the route from wherever it determines the user currently is, then routes through each saved stopping point in order.