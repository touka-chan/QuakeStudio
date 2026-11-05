# Hosting the API on Render

The simulator still runs entirely in the browser. Render hosts only the
FastAPI + PostgreSQL service that owns admin sessions, versioned content,
feedback, and the audit trail. The static frontend stays on Vercel.

> Educational prototype, not a structural safety assessment. The engineering
> assumptions remain placeholders pending adviser review.

## What you are deploying

```
Vercel (static React app)  ──HTTPS──▶  Render Web Service (FastAPI)
                                             │
                                             ▼
                                      Render PostgreSQL
```

- The solver, worker, and simulation history stay on the device.
- The APK never calls the API, even if `VITE_API_URL` leaked into its build.
- A production web build calls the API only when `VITE_API_URL` is set.

## Prerequisites

- The repository is pushed to GitHub.
- A Render account.
- A Vercel project for this repository.
- The Vercel production origin, for example `https://quake-studio.vercel.app`.

## 1. Deploy the Blueprint

1. Open the Render Dashboard.
2. Choose **New → Blueprint**.
3. Connect this repository and select the branch that contains `render.yaml`.
4. Apply the Blueprint.
5. When Render asks for `QUAKESTUDIO_ADMIN_PASSWORD`, enter a strong password.
   Do not reuse the local demo password.
6. If your frontend is not `https://quake-studio.vercel.app`, edit
   `QUAKESTUDIO_ALLOWED_ORIGINS` before applying. Use the exact origin: scheme,
   host, and no trailing slash. A Vercel preview URL is a different origin.

The Blueprint creates:

- `quakestudio-db`, a Render PostgreSQL database.
- `quakestudio-api`, a Python web service rooted at `apps/api`.
- The database connection, migrations, admin, and seed content on boot.

`apps/api/render-start.sh` is the boot command. It runs:

```sh
python -m alembic upgrade head
python -m app.seed --if-missing
python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

`--if-missing` means a restart or redeploy never resets an existing admin
password. The first boot creates the account from the Render secret. The seed
also publishes `seed/content.json` if no content exists yet.

## 2. Verify the service

Wait for the deploy to become live, then open:

```text
https://<your-service>.onrender.com/api/v1/health
```

It should return:

```json
{ "status": "ok", "database": "ok" }
```

If it returns `503`, open the Render logs. The usual causes are a missing
`QUAKESTUDIO_ADMIN_PASSWORD` on the first boot, a database that is still
starting, or a migration failure.

## 3. Point Vercel at the API

In the Vercel project:

1. Go to **Settings → Environment Variables**.
2. Add `VITE_API_URL` with the Render origin, for example
   `https://quakestudio-api.onrender.com`.
3. Set it for **Production** only. Do not set it for the APK build.
4. Redeploy the frontend.

The frontend reads the variable at build time. The value is a bare origin; do
not append `/api/v1`. If you use a proxy, a relative value such as `/` is also
accepted and resolves to the page origin.

After redeploying, `/admin` should show the backend sign-in form instead of the
demo credentials. The admin account is the email in `render.yaml`
(`admin@quakestudio.local` by default) and the password you entered in Render.

## 4. Check the important flows

- `/admin` sign-in and sign-out.
- Save a draft, publish it, and reload the public simulator.
- Submit a feedback response, then check it in the admin feedback list.
- Export feedback and confirm the `quakestudio-sus` JSON shape is unchanged.

## Cookies and CORS

The frontend and API are on different sites (`vercel.app` and `onrender.com`).
The Blueprint therefore configures:

- `QUAKESTUDIO_COOKIE_SECURE=true`
- `QUAKESTUDIO_COOKIE_SAMESITE=none`
- `QUAKESTUDIO_ALLOWED_ORIGINS=https://quake-studio.vercel.app`

The session cookie is `HttpOnly`, `Secure`, and `SameSite=None`. Browser
requests include credentials. The API also checks the `Origin` header on every
write, so a random site cannot drive the admin session even though CORS would
already block it from reading the response.

### If the cookie does not stick

Safari and some privacy modes block third-party cookies. If sign-in appears to
succeed but the next request is `401`, use one of these options:

1. Put both the frontend and API under one registrable domain, for example
   `app.example.com` and `api.example.com`, and point `VITE_API_URL` at the API
   origin.
2. Proxy `/api` through Vercel so the browser sees one origin. Add a rewrite to
   `vercel.json`:

   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://<your-service>.onrender.com/api/:path*"
       },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

   Then set `VITE_API_URL=/` in Vercel. Keep the Render `Origin` allow-list on
   the Vercel origin because the proxy forwards the browser's `Origin` header.

Cross-origin cookies work in current Chrome and Firefox, but the same-origin
proxy is the least surprising option for a public deployment.

## Free-plan limits

`render.yaml` uses free plans so the setup is easy to try. Before collecting
real study data:

- Free web services sleep after inactivity, so the first request can take a
  while. The frontend allows a longer timeout for a configured hosted API, but
  a cold start can still fail.
- Free PostgreSQL has storage and availability limits and may expire.
- There is no horizontal scaling or background worker in this Blueprint.

Move both services to a paid plan if the API needs to be reliably available.

## Security checklist

- Use a strong, unique `QUAKESTUDIO_ADMIN_PASSWORD`. It is a Render secret, not
  a value in Git.
- Keep `QUAKESTUDIO_ENABLE_DOCS=false` in production. The interactive docs are
  disabled by the Blueprint.
- List only the exact frontend origin in `QUAKESTUDIO_ALLOWED_ORIGINS`.
- Do not commit `apps/api/.env`.
- The public feedback endpoint has no rate limiter and no CAPTCHA. Add one
  before opening a study to the general internet.
- There is no email password reset and no multi-admin role. Changing the admin
  password means updating the Render secret and rotating the account manually;
  `--if-missing` deliberately will not reset it on redeploy.
- Logs and the audit trail are not a substitute for a retention policy. Decide
  how long feedback and audit rows should be kept.

## Local development is unchanged

Without `VITE_API_URL`, `npm run dev` still uses:

```text
http://localhost:8000/api/v1
```

and the existing local PostgreSQL setup in `apps/api/README.md`. The APK is
served from `https://localhost`; the API switch explicitly rejects that native
shell, so it behaves exactly like the offline build.
