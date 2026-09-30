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
   | `SUPPORT_EMAIL`, `SUPPORT_URL` | Optional: shown on the dashboard's **Help & support** page (e.g. a support address and your issue tracker) |
   | SMTP / Twilio values | Leave blank to start with the console providers |

   `JWT_SECRET` is generated automatically.
4. Click **Apply**. Render builds the Dockerfile and checks `GET /health`.
5. Open `https://<service-name>.onrender.com/docs`. You should see the API documentation.
   The business dashboard is at `https://<service-name>.onrender.com/`.

CI (`.github/workflows/ci.yml`) runs the tests on every pull request, so merge only when CI is
green.

### Automatic deploys

Every merge to `main` is deployed by GitHub Actions, not by Render itself. (Render cannot
auto-deploy a service created from a public repository URL, which is how the live demo was set
up.) After the tests and the Docker build pass on `main`, the `deploy` job:

1. calls the service's **deploy hook** for that exact commit, then
2. waits until `GET /health` reports that commit as live (`"commit"` comes from Render's
   `RENDER_GIT_COMMIT`), and fails with a clear error if it is not live within 15 minutes.

The run appears under the repository's **Deployments → production**. Set it up once:

1. **Render** (the account that owns the service): open the service → **Settings** →
   **Deploy Hook** → copy the URL. Treat it like a password: anyone with it can start a deploy.
2. **GitHub** (a repository admin): **Settings → Secrets and variables → Actions → New
   repository secret**, name `RENDER_DEPLOY_HOOK_URL`, value the URL from step 1. Or from a
   terminal: `gh secret set RENDER_DEPLOY_HOOK_URL --repo A2296/Notification-Service`.
3. Optional: if the service has another address, add a repository **variable**
   `RENDER_SERVICE_URL` (for example `https://notifyflow-labu.onrender.com`).
4. In Render, set the service's **Auto-Deploy** to **Off** so a later GitHub connection
   cannot deploy the same commit twice.

Until the secret exists, the `deploy` job fails on `main` with a message pointing here, so an
undeployed merge is never silent. To deploy by hand (for example to roll back), use
**Manual Deploy** in the Render dashboard.

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

Step-by-step trial setup for Brevo (email) and Twilio (SMS) is in the README:
[Real email and SMS with free trials](../README.md#real-email-and-sms-with-free-trials).

### Email (any SMTP provider)

Set `EMAIL_PROVIDER=smtp` and:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_USER / SMTP_PASS |
|---|---|---|---|
| Brevo (free 300/day) | `smtp-relay.brevo.com` | 2525 | SMTP login / SMTP key |
| SendGrid | `smtp.sendgrid.net` | 2525 | `apikey` / your API key |
| Gmail (testing only, paid Render plan) | `smtp.gmail.com` | 587 | address / [app password](https://myaccount.google.com/apppasswords) |

`EMAIL_FROM` must be an address or domain you have verified with the provider. Render's free
plan blocks the standard email ports (25, 465, 587), which is why the table uses 2525; on a paid
instance any port works. For good inbox placement, send from your own domain and add the SPF and
DKIM records your provider gives you.

If the mail server is unreachable, each attempt gives up after 10 seconds and is retried later,
so one slow provider cannot hold up SMS and in-app notifications. Failed notifications show the
provider's error in the dashboard's Activity page, with a **Retry** button.

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
- **Two-factor secrets:** set `MFA_ENCRYPTION_KEY` to its own long random value (the Render
  blueprint generates one). Without it, `JWT_SECRET` is used, and rotating `JWT_SECRET` would then
  stop users' authenticator codes from working; they could still sign in with a recovery code.
- **Secrets:** never commit `.env`. Rotate `JWT_SECRET` to log out all dashboard users;
  a user can end all of their own sessions with **Sign out** (`POST /api/v1/auth/logout`).
  Businesses rotate their own API keys by creating a new key and revoking the old one.
- **Audit log:** security events are logged to stdout as JSON lines with `"type":"audit"`
  (logins, logouts, registrations, API key creation/revocation, business suspensions).
  Forward them to your log platform and alert on bursts of `auth.login.failure`.
- **Backups:** enable Atlas backups (paid tiers) or schedule `mongodump`.
