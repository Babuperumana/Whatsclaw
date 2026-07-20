# Deploying to Coolify

This app is a Node.js WhatsApp bot + Express dashboard backed by SQLite. It keeps
three pieces of state that must survive restarts and redeploys:

| State | Path (in container) | Purpose |
|-------|---------------------|---------|
| `database.sqlite` | `/data/database.sqlite` | All app data (bookings, devotees, etc.) |
| `auth_info_baileys/` | `/data/auth_info_baileys/` | WhatsApp login session |
| `.jwt_secret` | `/data/.jwt_secret` | Signs dashboard login cookies |
| `uploads/` | `/data/uploads/` | Temp store for files sent from the WhatsApp panel (auto-deleted after each send) |

All three live under a single volume mounted at **`/data`** (`DATA_DIR=/data`).
Locally, if `DATA_DIR` is unset, they stay in the project directory as before.

## 1. Create the application in Coolify

1. New Resource → **Application** → point it at this repository (or a Git remote of it).
2. Build Pack: **Dockerfile** (Coolify auto-detects the `Dockerfile` at the repo root).
3. Port: **3001** (the container exposes 3001).

## 2. Add a persistent volume

In the application's **Storages** tab, add a persistent volume:

- **Mount path:** `/data`

This single mount holds the database, WhatsApp session, and JWT secret. Without it,
you lose your data and have to re-scan the WhatsApp QR on every redeploy.

## 3. Environment variables

Set these in the application's **Environment Variables** tab:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATA_DIR` | `/data` | Where all persistent state lives. |
| `PORT` | `3001` | Must match the exposed port. |
| `NODE_ENV` | `production` | Enables secure (HTTPS-only) login cookies. |
| `JWT_SECRET` | *(long random string)* | Signs login cookies. Generate with `openssl rand -hex 48`. If omitted, the app auto-generates one at `/data/.jwt_secret`. |

> Set `NODE_ENV=production` only when the app is served over HTTPS (Coolify does this
> by default with its generated domain / your custom domain + TLS). Secure cookies
> won't be sent over plain HTTP, which would break dashboard login.

## 4. First deploy — link WhatsApp

On the **first** boot the entrypoint creates the database schema automatically
(it detects there's no `/data/database.sqlite` yet). On later restarts it detects the
existing DB and skips init, so your data is never wiped.

To link the WhatsApp bot, open the application **Logs** in Coolify right after the
first deploy. The bot prints a QR code as ASCII in the logs:

```
Please scan the following QR Code in WhatsApp to link the bot:
<ascii qr>
```

Scan it from WhatsApp → Settings → Linked Devices → Link a Device. The session is
saved to `/data/auth_info_baileys/` and reused on future restarts (no re-scan needed).

If the QR is hard to scan from the log view, increase the log window / font, or
temporarily redeploy and catch it fresh — a new QR is emitted until the device links.

## 5. Default dashboard login

The schema seeds an initial admin user in `initDb.js`. Log in, then change the
credentials from the dashboard (or update the `users` table) before going live.

## Resetting / re-initializing the database

The init step runs **only** when `/data/database.sqlite` is absent, because
`initDb.js` drops and recreates every table. To deliberately reset:

1. Delete `/data/database.sqlite` from the volume (Coolify terminal or a one-off command).
2. Restart the application — a fresh schema is created on next boot.

## Building / testing locally

Easiest via Compose (`docker-compose.yml` is included for local use only — Coolify
builds from the Dockerfile directly and ignores it):

```bash
JWT_SECRET=$(openssl rand -hex 48) docker compose up --build
docker compose logs -f        # watch for the WhatsApp QR code
```

Or with plain Docker:

```bash
docker build -t temple-upi-gateway .

docker run -d --name temple \
  -p 3001:3001 \
  -e JWT_SECRET="$(openssl rand -hex 48)" \
  -v temple_data:/data \
  temple-upi-gateway

docker logs -f temple          # grab the WhatsApp QR
```

Visit http://localhost:3001/login. State persists in the `temple_data` volume across
`docker restart` / recreate.

## Security notes

- The dashboard has no rate limiting on login; keep it behind Coolify's HTTPS and use
  a strong `JWT_SECRET`.
- `database.sqlite` contains PII — it is gitignored and `.dockerignore`d so it is never
  baked into the image. It only ever exists on the `/data` volume.
