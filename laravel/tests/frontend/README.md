# Frontend regression tests

Run `npm ci`, then `npm test`. Use `npm run test:watch` during development.

Vitest and React Testing Library run components in jsdom. TravelPosts tests
exercise guest direct links, authentication prompts, authenticated tabs, and
router history, with mocked API responses. Redirect tests cover Continue as
Guest destinations. These are component tests, not full browser end-to-end tests.

Run `php artisan test` for backend coverage and `npm run build` to verify the
production bundles.

`npm run optimize:achievements` regenerates WebP badge assets from the original
PNGs at up to 640 pixels. The originals remain available for future exports.

The map boundary GeoJSON keeps seven decimal places (under one centimetre of
rounding per coordinate) and all original vertices, avoiding floating-point
noise in the deployed map data.
