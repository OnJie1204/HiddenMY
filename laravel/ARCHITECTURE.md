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
```

Dependencies should point from delivery code toward application and domain
code. Models and services must not import controllers, routes, or React code.
Controllers must not call other controllers.

## Backend layout

```text
app/
  Http/Controllers/
    Auth/          Authentication and OAuth endpoints
    HiddenGems/    Gems, votes, reports, interactions, and menu items
    Travel/        Itineraries and travel posts
    Users/         Profiles, wishlists, and achievements
  Jobs/            Asynchronous application work
  Models/          Eloquent domain and persistence models
  Services/        Reusable business operations and external integrations
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
  features/
    auth/api.js
    community/     Votes, reports, ratings/comments, and menu-item APIs
    hidden-gems/api.js
    travel/        Itinerary and travel-post APIs
    users/         Wishlist and achievement APIs
  pages/            Route-level React views
  components/       Reusable presentation components
  context/          Cross-page UI state
  utils/            Framework-independent helpers
```

Pages and components should use a feature API rather than constructing API URLs
directly. Feature API modules may depend on `resources/js/api.js`; they should
not depend on React components. Shared components should remain business-neutral
unless they clearly belong to one feature.

## Adding functionality

1. Put the route in the matching `routes/api/*.php` file.
2. Put its controller in the matching controller namespace.
3. Reuse a service for business rules shared by multiple endpoints.
4. Add the browser request to the matching `resources/js/features/*` API.
5. Keep public response fields explicit and cover lifecycle changes with a
   feature test.
