# Queue & Scheduler — running the AI verification

Hidden Gem AI verification (`App\Jobs\VerifyHiddenGemSubmission`) is a **queued job**.
It must NOT run inside the HTTP request (it takes 30 s – 4 min and calls Gemini).
The queue is now `database` (`QUEUE_CONNECTION=database` in `.env`), so a worker
and the scheduler have to be running or gems stay stuck at `pending`.

`routes/console.php` already schedules:
- `hidden-gems:retry-verification` every 5 min — re-runs gems left `pending` by a
  transient Gemini failure (up to 5 attempts each).
- `queue:work --stop-when-empty --max-time=55` every minute — drains the queue
  (only when `QUEUE_CONNECTION` is not `sync`).

So a single `schedule:*` process covers both, but a dedicated `queue:work`
daemon is snappier.

---

## Local development

`composer dev` now runs everything (server, queue, **scheduler**, logs, vite):

```
composer dev
```

Or manually, in separate terminals:

```
php artisan serve
php artisan queue:listen --tries=1 --timeout=300
php artisan schedule:work
```

`.env` must have:
```
QUEUE_CONNECTION=database
DB_QUEUE_RETRY_AFTER=360      # > the job's 240 s $timeout
```

Recover any gems already stuck at `pending`:
```
php artisan hidden-gems:retry-verification
```

---

## Railway

Set the environment variables on **every** service:
```
QUEUE_CONNECTION=database
DB_QUEUE_RETRY_AFTER=360
```
(plus the existing `APP_KEY`, DB, `SUPABASE_*`, `GEMINI_API_KEY`).

Do **not** run `php artisan config:cache` in the build unless the ~48 direct
`env('SUPABASE_KEY')` / `env('SUPABASE_URL')` calls in the controllers are first
moved into config files — cached config makes `env()` return null and every
image upload fails.

### Option A — minimal (2 pieces)

| Piece | Setup |
|---|---|
| **web** | your existing web service |
| **cron** | on any service, Railway → *Settings → Cron Schedule* → `* * * * *`, start command `php artisan schedule:run` |

The per-minute `schedule:run` drains the queue **and** fires the 5-min retry
sweep (see `routes/console.php`). Verification finishes within ~60 s of submit.

### Option B — snappier (3 pieces)

| Piece | Setup |
|---|---|
| **web** | your existing web service |
| **worker** | new service, same repo, start command:<br>`php artisan queue:work --tries=1 --timeout=300 --sleep=3 --max-time=3600` |
| **cron** | `* * * * *` → `php artisan schedule:run` (now only the retry sweep) |

Verification finishes within a few seconds of submit.

### Notes

- If your local machine and Railway point at the **same** Supabase DB and both
  have a worker running, they share one `jobs` queue — stop the local worker
  when demoing the deployed app.
- `queue:work` is long-lived; `--max-time=3600` makes it exit hourly so a
  code deploy is picked up (Railway restarts it).
- Failed jobs land in the `failed_jobs` table: `php artisan queue:failed`.
