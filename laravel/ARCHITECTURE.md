# Architecture

HiddenMY is a Laravel MVC modular monolith with a React single-page view layer.
The refactoring rules below keep that architecture while grouping request code
by cohesive business feature.

## Dependency direction

```text
React page/component -> feature API -> shared Axios client
                                           |
                                           v
feature route -> feature controller -> service/job -> Eloquent model
                                      |
                                      v
                              integration contract/client -> external provider
```

Dependencies should point from delivery code toward application and domain
code. Models and services must not import controllers, routes, or React code.
Controllers must not call other controllers.

All outbound HTTP belongs in `app/Integrations`. Controllers, commands, jobs,
and domain services call a provider client (or a provider-neutral contract) and
must not construct provider URLs, headers, or credentials themselves. Read
environment variables through Laravel configuration rather than calling
`env()` from application code.

## Backend layout

```text
app/
  Contracts/       Provider-neutral boundaries such as object storage
  Console/Commands/
    Achievements/  Achievement maintenance and demo tooling
    HiddenGems/    Hidden-gem verification, promotion, and OSM sync
  Http/Controllers/
    Auth/          Authentication and OAuth endpoints
    HiddenGems/    Gems, votes, reports, interactions, and menu items
    Travel/        Itineraries and travel posts
    Users/         Profiles, wishlists, and achievements
  Integrations/
    Gemini/        Gemini transport, model fallback, and retry policy
    Geocoding/     Nominatim and Photon HTTP clients
    Http/          Shared remote-resource clients
    OpenStreetMap/ Overpass HTTP client
    Storage/       Supabase object-storage adapter
    Wikimedia/     Wikidata and Commons image lookup
  Jobs/
    HiddenGems/    Asynchronous verification and edit-review work
  Models/          Eloquent domain and persistence models
  Notifications/
    Auth/          Authentication and email-verification notifications
  Services/
    Achievements/  Achievement evaluation and awarding
    Community/     Community-content policies such as profanity filtering
    Geocoding/     Malaysia-focused geocoding policy and normalization
    HiddenGems/    Search, duplicate detection, and OSM attraction caching
  Support/         Small framework-independent helpers

routes/
  api.php          API route composition only
  api/
    auth.php
    hidden-gems.php
    system.php
    travel.php
    users.php
```

Keep controllers thin when adding new behavior. Validation belongs in a Form
Request when it is reused or substantial; multi-step business workflows belong
in a service or action; slow external calls belong in queued jobs.

## Frontend layout

```text
resources/js/
  api.js           Shared HTTP transport and authentication interceptors
  assets/
    achievements/
    branding/
    common/
    development/
    maps/
    navigation/
  components/
    achievements/
    auth/
    common/
    community/
    hidden-gems/
    layout/
    travel/
  constants/
    achievements/
    auth/
  context/
    auth/
  features/
    auth/api.js
    community/     Votes, reports, ratings/comments, and menu-item APIs
    hidden-gems/api.js
    travel/        Itinerary and travel-post APIs
    users/         Wishlist and achievement APIs
  pages/           Route-level React views grouped by module
    auth/
    hidden-gems/
    home/
    travel/
    users/
  utils/
    auth/
    hidden-gems/
    maps/
    users/

public/images/
  maps/             Public marker images referenced by runtime URLs

resources/css/
  app.css           Laravel/Vite stylesheet entry point
  base/global.css   Application-wide design and layout rules
  modules/maps.css  Map-specific presentation rules
```

Pages and components should use a feature API rather than constructing API URLs
directly. Feature API modules may depend on `resources/js/api.js`; they should
not depend on React components. Shared components should remain business-neutral
unless they clearly belong to one feature.

Use the `@/` alias for imports rooted at `resources/js` and `@css/` for imports
rooted at `resources/css`. Module folders can then move without rewriting deep
relative paths.

## Test layout

```text
tests/
  Feature/
    Achievements/
    Community/
    HiddenGems/
    System/
    Travel/
    Users/
  Unit/
    Community/
    System/
```

Tests mirror the feature they protect, while `System` contains framework-level
smoke tests. Shared test bootstrapping remains in `tests/TestCase.php`.

## Deliberately shared Laravel conventions

`app/Models`, `database/factories`, and `database/migrations` remain flat.
Eloquent models are shared across several modules, Laravel resolves factories by
their conventional namespaces, and migrations are deployment history ordered by
timestamp. Moving these files would require extra framework configuration without
changing the MVC or modular-monolith boundaries.

## Adding functionality

1. Put the route in the matching `routes/api/*.php` file.
2. Put its controller in the matching controller namespace.
3. Reuse a service for business rules shared by multiple endpoints.
4. Add the browser request to the matching `resources/js/features/*` API.
5. Keep public response fields explicit and cover lifecycle changes with a
   feature test.
