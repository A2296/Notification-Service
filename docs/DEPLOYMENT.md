# Deployment Guide

The service is one Docker container plus a MongoDB database. This guide deploys it for free with
**MongoDB Atlas** (database) and **Render** (hosting). Any platform that runs a Dockerfile
(Railway, Fly.io, Azure Container Apps, a VPS with `docker compose`) works the same way.

## 1. Create the database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas and create a free **M0** cluster.
2. **Database Access** → add a database user with a strong password.
3. **Network Access** → allow `0.0.0.0/0` (Render's free tier has no fixed outbound IP).
4. **Connect → Drivers** → copy the connection string and add a database name:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/notification_service?retryWrites=true&w=majority`

## 2. Deploy the API (Render)

1. Sign in at https://render.com with GitHub.
2. **New → Blueprint** → choose this repository. Render reads [`render.yaml`](../render.yaml).
3. Fill in the prompted values:
   | Variable | Value |
   |---|---|
   | `DB_CONNECTION_STRING` | Atlas string from step 1 |
   | `PUBLIC_BASE_URL` | `https://<service-name>.onrender.com` (you can set it after the first deploy) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your platform admin login |
   | SMTP / Twilio values | Leave blank to start with the console providers |

   `JWT_SECRET` is generated automatically.
4. Click **Apply**. Render builds the Dockerfile and checks `GET /health`.
5. Open `https://<service-name>.onrender.com/docs`. You should see the API documentation.
   The business dashboard is at `https://<service-name>.onrender.com/`.

Every push to `main` redeploys automatically. CI (`.github/workflows/ci.yml`) runs the tests
on every pull request, so merge only when CI is green.

## 3. Create the platform admin

Render's free plan has no shell, so run the seed script from your machine against Atlas:

```bash
DB_CONNECTION_STRING="mongodb+srv://..." \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' \
npm run seed:admin
```

On Windows PowerShell:

```powershell
$env:DB_CONNECTION_STRING="mongodb+srv://..."; $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-strong-password"; npm run seed:admin
```

## 4. Turn on real delivery (optional)

### Email (any SMTP provider)

Set `EMAIL_PROVIDER=smtp` and:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_USER / SMTP_PASS |
|---|---|---|---|
| Brevo (free 300/day) | `smtp-relay.brevo.com` | 587 | SMTP login / SMTP key |
| SendGrid | `smtp.sendgrid.net` | 587 | `apikey` / your API key |
| Gmail (testing only) | `smtp.gmail.com` | 587 | address / [app password](https://myaccount.google.com/apppasswords) |

`EMAIL_FROM` must be an address or domain you have verified with the provider.

### SMS (Twilio)

Set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`
(or `TWILIO_MESSAGING_SERVICE_SID`). With `PUBLIC_BASE_URL` set, Twilio calls
`/api/v1/webhooks/twilio/status` and SMS notifications move from `SENT` to `DELIVERED`.
Twilio trial accounts can only send to verified numbers.

## 5. Smoke test the deployment

```bash
URL=https://<service-name>.onrender.com
curl $URL/health
# Then follow "Integrate in 3 steps" in the README against $URL
```

## Operational notes

- **Free tier sleep:** Render's free web services sleep after 15 minutes idle; the first request
  takes about a minute, and scheduled notifications wait until the service wakes. Use a paid
  instance (or an uptime pinger) for a demo or real use.
- **Scaling:** the delivery worker claims notifications atomically, so running several
  instances is safe. For very high volume, run API and worker separately
  (`WORKER_ENABLED=false` on API instances).
- **HTTPS:** always serve the service over HTTPS (Render does this automatically). Behind a proxy,
  keep `TRUST_PROXY=1` so the app sees the original scheme and client IP. With `NODE_ENV=production`
  (set in the Dockerfile) the dashboard session cookie is `Secure`, so it is never sent over plain HTTP.
- **Secrets:** never commit `.env`. Rotate `JWT_SECRET` to log out all dashboard users;
  a user can end all of their own sessions with **Sign out** (`POST /api/v1/auth/logout`).
  Businesses rotate their own API keys by creating a new key and revoking the old one.
- **Audit log:** security events are logged to stdout as JSON lines with `"type":"audit"`
  (logins, logouts, registrations, API key creation/revocation, business suspensions).
  Forward them to your log platform and alert on bursts of `auth.login.failure`.
- **Backups:** enable Atlas backups (paid tiers) or schedule `mongodump`.
