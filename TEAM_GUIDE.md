# Gemora — Team Development Guide

This guide helps new contributors understand the project structure and know where to add their own module's code.

## 1. Overall Architecture

```
Gemora/
├── backend/     ← Laravel (PHP) — handles API and database
└── frontend/    ← React — handles the UI
```

React never talks to the database directly. Every piece of data comes from calling the Laravel API:

```
React (UI)  →  calls API  →  Laravel (logic)  →  Supabase (PostgreSQL database)
```

## 2. Environment Setup (for a new machine)

```bash
# 1. Install Node.js, PHP (8.2+), Composer
# 2. Clone the project
git clone <repo-url>

# 3. Backend dependencies
cd backend
composer install

# 4. Frontend dependencies
cd ../frontend
npm install

# 5. Get backend/.env content from a teammate (NOT on GitHub — share it privately)

# 6. Check PHP has the pgsql extension enabled
php -m | findstr pgsql
# If missing: open php.ini (find path with `php --ini`) and remove the
# leading ";" from these two lines:
#   extension=pdo_pgsql
#   extension=pgsql

# 7. Generate an app key if .env doesn't have one
php artisan key:generate

# 8. Run both sides
php artisan serve      # backend
npm run dev             # frontend (separate terminal)
```

## 3. Backend Structure — Where to Add Your Code

```
backend/
├── app/
│   ├── Http/Controllers/
│   │   ├── AuthController.php        ← Account Management (existing)
│   │   ├── HiddenGemController.php    ← Hidden Gems module (to be created)
│   │   ├── TravelPostController.php   ← Travel Posts module (to be created)
│   │   └── TripController.php         ← Trip Itinerary module (to be created)
│   └── Models/
│       ├── User.php                   ← existing
│       ├── HiddenGem.php               ← to be created
│       └── ...
├── database/migrations/                ← each module adds its own tables here
└── routes/api.php                       ← everyone adds their routes here (see rules below)
```

**Recommended workflow per module** (same pattern used for Account Management):

1. `php artisan make:model YourModel -m` (creates both the model and a migration)
2. Write the migration (define table columns), then `php artisan migrate`
3. `php artisan make:controller YourModelController`
4. Write CRUD methods in the controller (create, read, update, delete)
5. Add matching routes in `routes/api.php`

## 4. Frontend Structure — Where to Add Your Code

```
frontend/src/
├── api/
│   ├── auth.js            ← Account Management (existing)
│   ├── hiddenGems.js        ← to be created, follow auth.js's pattern
│   └── ...
├── components/
│   ├── Navbar.jsx           ← shared, already built
│   ├── Footer.jsx            ← shared, already built
│   └── Layout.jsx             ← shared, already built
├── pages/
│   ├── Login.jsx               ← existing
│   ├── Home.jsx                  ← existing
│   ├── HiddenGems.jsx              ← to be created
│   └── ...
├── styles/global.css                ← shared styles, reuse existing classes
└── App.jsx                            ← everyone adds their own <Route> here
```

**Example steps for a new module (Hidden Gems)**:

1. Create `api/hiddenGems.js`, following the same pattern as `api/auth.js`:
   ```js
   import api from '../api';

   export const getHiddenGems = () => api.get('/hidden-gems');
   export const createHiddenGem = (data) => api.post('/hidden-gems', data);
   export const updateHiddenGem = (id, data) => api.put(`/hidden-gems/${id}`, data);
   export const deleteHiddenGem = (id) => api.delete(`/hidden-gems/${id}`);
   ```

2. Create `pages/HiddenGems.jsx` and use these functions to fetch/display data.

3. Add a route in `App.jsx` (placeholder routes are already commented in):
   ```jsx
   <Route path="/hidden-gems" element={
     user ? <Layout user={user} setUser={setUser}><HiddenGems /></Layout> : <Navigate to="/login" />
   } />
   ```

4. Reuse existing CSS classes (`section-card`, `form-input`, `btn btn-primary`,
   `msg-success`, `msg-error`, etc.) instead of writing new styles from scratch.

## 5. Ground Rules (to avoid stepping on each other)

- **`routes/api.php`**: everyone edits the same file. Add your routes at the
  bottom, grouped under a comment with your name, e.g.:
  ```php
  // ==== Hidden Gems (owner: XXX) ====
  Route::middleware('auth:sanctum')->group(function () {
      Route::apiResource('hidden-gems', HiddenGemController::class);
  });
  ```

- **`App.jsx`**: same idea — everyone adds their own `<Route>` here. Watch out
  for merge conflicts; commit your own part first, then pull others' updates.

- **Don't edit files owned by someone else** (e.g. `AuthController.php`)
  unless you've discussed it with them first.

- **Navbar links are already set up** (Map / Hidden Gems / Travel Posts /
  Trip Itinerary). You just need to make sure your page matches the
  corresponding route path — no need to touch the Navbar itself.

## 6. Sharing Authentication Across Modules

Any feature that requires login should use `middleware('auth:sanctum')` on
its Laravel routes. Inside the controller, `$request->user()` gives you the
currently logged-in user, e.g.:

```php
public function store(Request $request)
{
    $hiddenGem = HiddenGem::create([
        'user_id' => $request->user()->id, // track who created it
        'name' => $request->name,
        // ...
    ]);

    return response()->json($hiddenGem, 201);
}
```
