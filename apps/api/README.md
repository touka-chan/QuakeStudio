# QuakeStudio API

FastAPI + PostgreSQL for admin sessions, versioned content, feedback, and an
audit trail. It runs locally for development and can be hosted on Render; the
static frontend uses it only when an API origin is configured.

The simulation itself does **not** run here. It stays in the browser Web Worker,
so dragging a slider never waits for a network round trip. This service owns:

- admin sign-in and opaque sessions
- versioned published content and the admin draft
- SUS feedback responses
- an audit trail

> Educational prototype, not a structural safety assessment. The engineering
> assumptions remain placeholders pending adviser review.

## Requirements

- Python 3.12+
- PostgreSQL 16 (Docker Compose is provided)
- Node 22.12+ if you want to regenerate the content contract

## First run

From `apps/api`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"

Copy-Item .env.example .env
# edit .env and change QUAKESTUDIO_ADMIN_PASSWORD

docker compose up -d
python -m alembic upgrade head
python -m app.seed --email admin@quakestudio.local
```

The seed command prompts for the admin password. It publishes
`seed/content.json` as version 1 if no content exists.

Start the API:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/docs>.

From the repository root, start the web app in a second terminal:

```powershell
npm run dev
```

When the page is served by the Vite dev server on `localhost` or `127.0.0.1`,
the web app detects the local API, loads published content, and uses the API
for admin sign-in, drafts, publishing, and feedback. A production build uses
the API only when `VITE_API_URL` is set; the APK never uses it. If the API is
not reachable, the app keeps its browser-local content and feedback fallback.

To host this service on Render and connect the Vercel frontend, follow
[`../../docs/render.md`](../../docs/render.md). The repository root includes a
`render.yaml` Blueprint and `apps/api/render-start.sh` for migrations and the
first-boot seed.

## Content contract

The backend does not maintain a second hand-written copy of the content shape.
`app/content_schema.json` and `seed/content.json` are generated from the browser
Zod schema:

```powershell
# repository root
npm run backend:content
```

The API validates every saved document against that JSON Schema plus the
cross-field rules in `app/validation.py`. Regenerate both files whenever
`apps/web/src/content/schema.ts` or the defaults change.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | no | Database check |
| POST | `/api/v1/auth/login` | no | Sign in, set session cookie |
| GET | `/api/v1/auth/me` | cookie | Current admin |
| POST | `/api/v1/auth/logout` | cookie | Revoke session |
| GET | `/api/v1/content/published` | no | Latest published document |
| GET | `/api/v1/admin/content` | cookie | Published + current draft |
| PUT | `/api/v1/admin/content/draft` | cookie | Create/update the draft |
| DELETE | `/api/v1/admin/content/draft` | cookie | Discard the draft |
| POST | `/api/v1/admin/content/publish` | cookie | Upsert and publish a document |
| GET | `/api/v1/admin/content/versions` | cookie | Version history |
| GET | `/api/v1/admin/content/versions/{version}` | cookie | One version |
| POST | `/api/v1/admin/content/versions/{version}/restore` | cookie | Restore into a draft |
| POST | `/api/v1/feedback` | no | Submit SUS (server recomputes score) |
| GET | `/api/v1/admin/feedback` | cookie | List responses + summary |
| GET | `/api/v1/admin/feedback/export` | cookie | `quakestudio-sus` JSON export |
| DELETE | `/api/v1/admin/feedback/{id}` | cookie | Delete one response |
| DELETE | `/api/v1/admin/feedback` | cookie | Clear all responses |
| GET | `/api/v1/admin/stats` | cookie | Dashboard counts |
| GET | `/api/v1/admin/activity` | cookie | Audit feed |

Cookie-authenticated writes also require a trusted `Origin` header. Requests
with no `Origin` header (CLI, tests) are allowed.

## Tests

```powershell
cd apps/api
python -m pytest
```

The test suite uses an in-memory SQLite database so it does not need a running
Postgres instance. PostgreSQL remains the supported database for real use; the
models use JSONB on Postgres and generic JSON on SQLite.

## Deliberate limits

- Local development binds to `127.0.0.1` and trusts the Vite dev origins. The
  Render Blueprint opts into a public HTTPS origin and cross-site cookies; it
  does not change the local defaults.
- No run storage: simulation histories are large and stay in IndexedDB.
- No server-side solver: the Python reference solver remains a validation tool,
  not a live endpoint.
- No password reset by email, no multi-admin roles, no rate limiter. Those are
  still production features to add before a public study.
