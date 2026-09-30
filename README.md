# NotifyFlow

NotifyFlow is a Notification Service platform. It gives registered businesses one place to sign up, send email, SMS, and in-app notifications, monitor delivery activity, and manage the API keys their own servers use.

A multi-tenant notification platform that other businesses and applications integrate with.
A business registers, gets an **API key and secret**, and calls one API to send **email**,
**SMS** and **in-app** notifications to its own users. The service validates each request,
identifies the business and recipient, delivers through the right provider, retries failures
and tracks every status change.

Built with Node.js, Express 5, MongoDB (Mongoose), Nodemailer and Twilio.

- **Live demo:** https://notifyflow-labu.onrender.com (dashboard) ·
  [Help & plans](https://notifyflow-labu.onrender.com/#help) ·
  [API docs](https://notifyflow-labu.onrender.com/docs) ·
  [health](https://notifyflow-labu.onrender.com/health)
- **Interactive API docs:** `/docs` (Swagger UI), raw spec at `/openapi.json`
- **Deployment:** every merge to `main` is deployed automatically once CI passes
  ([how it works](#deployment), [full guide](docs/DEPLOYMENT.md))

> The live demo runs on free hosting: after 15 minutes without visitors it sleeps, so the first
> page load can take about a minute. Emails and SMS are logged by the server rather than
> delivered, so no real messages are sent. Register any business on the dashboard to try it,
> or open the Help page first; it needs no account.

---

## Features

| Area | What's included |
|---|---|
| Multi-tenancy | Business accounts; every record is scoped to its business and isolation is tested |
| Authentication | API key + secret for integrations (secret hashed, shown once, revocable, up to 10 active per business); dashboard sessions in an HttpOnly cookie (JWT bearer for scripts and Swagger) with server-side logout; optional two-factor authentication (authenticator app + recovery codes) |
| Authorization | Business users vs. platform `ADMIN`; suspending a business blocks its keys and logins at once |
| Channels | `EMAIL` (any SMTP provider), `SMS` (Twilio), `IN_APP` (per-recipient inbox with read tracking) |
| Delivery | Background worker, automatic retries with exponential backoff, permanent-failure detection, crash recovery, scheduled sends |
| Tracking | `PENDING → PROCESSING → SENT → DELIVERED / FAILED`, with a timestamped event history per notification; in-app read rate (read / delivered) |
| Reliability | `Idempotency-Key` header prevents duplicate sends; manual retry of failed notifications (API or dashboard) |
| Bulk sends | Up to 100 notifications per request, shared fields plus per-recipient overrides, per-item results |
| Scheduling | Send later (`scheduledAt`) and recurring schedules: daily, weekly or monthly at a local time in the business's timezone, with pause, resume and run now |
| Plans & usage | Free / Starter / Pro plans with a monthly notification limit (1,000 / 10,000 / 100,000 by default), assigned by the platform admin (no payments); usage counted from the notifications themselves, shown on the dashboard, and enforced for single, bulk and scheduled sends |
| Recipients | Store your users' contact details once, then send by your own user ID |
| Validation | Every request is validated with zod and returns field-level error messages |
| Security | Helmet headers and a strict CSP for the dashboard, CSRF protection, per-IP login rate limit, per-business API rate limit, NoSQL/regex injection protection, bcrypt passwords, audit log |
| Dashboard | Business web dashboard served by the API at `/` (see below) |
| Operations | Docker, docker-compose (with a local email inbox), `/health` (including the deployed commit), graceful shutdown, GitHub Actions CI with automatic deploys to Render, Render blueprint |
| Accounts | Profile, business details, plan and usage, password change (signs out other devices), two-factor authentication, delivery and limits overview |
| Docs & tests | OpenAPI 3 spec + Swagger UI; 122 tests |

---

## Frontend Features

The dashboard in [`Notification-Service-Dashboard/frontend`](Notification-Service-Dashboard/frontend)
is served by the API itself, so it is available at `http://localhost:5000/` (or your deployed URL)
with no separate hosting or configuration.

- Business registration and sign-in; sign-out ends the session on the server
- Overview of total, sent/delivered, in-progress and failed notifications, plus the in-app read rate and this month's plan usage (amber near the limit, red when it is reached)
- Notification composer for email, SMS and in-app channels (with duplicate-send protection)
- Bulk mode: paste up to 100 recipients and send the same message to all of them
- Delivery-activity table with server-side search and status filters
- Failed notifications show the provider's error and a **Retry** button
- **Send later**: pick a date and time in the composer
- **Schedules** page: recurring sends (every day, chosen weekdays or a day of the month) with pause, resume, run now and delete
- **Profile** (top-right account button): name, email, role, business, member since, last sign-in, two-factor status and sign-out
- **Settings**: business details, plan and usage, password change, two-factor authentication with recovery codes, sign out everywhere, delivery channel status, API base URL, API documentation and your limits
- **Help & support**: what NotifyFlow is, getting-started steps, the plans on offer, FAQ and a support contact (`SUPPORT_EMAIL`, `SUPPORT_URL`); readable before signing in, and linked from the sign-in dialog
- On phones the sidebar is a drawer: a tap outside it or Escape closes it (without pressing what is underneath), and the page behind it stays still; on short screens the sidebar scrolls
- Collapsible sidebar (icon rail on desktop; your choice is remembered in this browser)
- API key management: generate (secret shown once), list, revoke, plus a ready-to-run `curl` sample
- Demo mode with sample data when the page is opened without the API (e.g. from a static server)
- Responsive layout for desktop and mobile devices
- Accessible form labels and semantic status output

Security: the session token is in an HttpOnly, `SameSite=Strict` cookie that JavaScript cannot read,
nothing sensitive is kept in browser storage, every request is same-origin with a 15-second timeout,
and the page runs under a Content-Security-Policy with no inline scripts or styles.

---

## Frontend Technology

| Area | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3 |
| Interactivity and API requests | Vanilla JavaScript (ES6+) |
| Backend integration | REST API using `fetch` |

---

## How it works

```text
 Business backend                 Notification Service                         Providers
 ────────────────                 ────────────────────                         ─────────
 POST /api/v1/notifications ──►  validate + authenticate (API key)
   X-API-Key / X-API-Secret       resolve recipient, store as PENDING
                           ◄──── 202 Accepted { id, status: PENDING }
                                         │
                                         ▼
                                  Delivery worker (MongoDB-backed queue)
                                  claims job → PROCESSING ─────────────────►  SMTP (email)
                                  success   → SENT / DELIVERED               Twilio (SMS)
                                  temporary failure → retry with backoff       In-app inbox
                                  permanent failure → FAILED
                                         ▲
 GET /api/v1/notifications/:id ──►       │            Twilio status callback ─┘
   (status + event history)       SENT → DELIVERED / FAILED
```

The API responds immediately and delivery happens in the background, so a slow provider never
blocks the calling business. The queue lives in MongoDB, so pending notifications survive
restarts and no extra infrastructure (Redis, RabbitMQ) is needed.

---

## Quick start

### Option A: Docker (recommended)

```bash
docker compose up --build -d
docker compose exec api npm run seed:admin   # platform admin: admin@example.com / ChangeMe123
```

| URL | What |
|---|---|
| http://localhost:5000/ | Business dashboard: register, send notifications, manage API keys |
| http://localhost:5000/docs | API documentation (try requests in the browser) |
| http://localhost:5000/health | Health check |
| http://localhost:8025 | **Mailpit**: every email the service sends appears here |

Stop with `docker compose down`. Add `-v` to also wipe the database.

### Try it in the browser (no curl needed)

In http://localhost:5000/docs, open an endpoint, click **Try it out**, then **Execute**.

1. **`POST /api/v1/auth/register`**: copy the `token` from the response.
   A **409** means that email is already registered, so use **`POST /api/v1/auth/login`** to get a token instead.
2. Click **Authorize** (top of the page), paste the token under **BearerAuth** (without the word "Bearer"), then **Authorize** → **Close**.
3. **`POST /api/v1/api-keys`**: copy `apiKey` and `apiSecret` (the secret is shown only once).
4. **Authorize** again: paste them under **ApiKey** and **ApiSecret**. You are now calling the API like a business's server would.
5. **`POST /api/v1/notifications`**: returns **202** with status `PENDING`. Check **`GET /api/v1/notifications/{id}`** for the final status, and Mailpit for the email.

A **401 "Authentication token is required"** means nothing was entered under Authorize: the
**Curl** box of the request should include an `Authorization` or `X-API-Key` header.
Authorization is remembered across page refreshes; use **Authorize → Logout** to clear it.

### Option B: Node.js + your own MongoDB

```bash
npm install
cp .env.example .env     # set DB_CONNECTION_STRING and JWT_SECRET
npm run seed:admin       # optional: platform admin
npm run dev              # or: npm start
```

The server refuses to start if `DB_CONNECTION_STRING` or `JWT_SECRET` is missing.

---

## Integrate in 3 steps

Replace `$URL` with `http://localhost:5000` or your deployed URL. These `curl` commands are for
bash (macOS, Linux, **Git Bash** on Windows). In **Windows PowerShell**, `curl` is a different
command, so use the [PowerShell version](#windows-powershell) below.

**1. Register your business** (returns a dashboard token)

```bash
curl -X POST $URL/api/v1/auth/register -H "Content-Type: application/json" -d '{
  "businessName": "Acme Stores", "name": "Ada", "email": "ada@acme.com", "password": "Password123"
}'
```

**2. Create an API key** (the secret is shown **once**, so store it in your server's secrets)

```bash
curl -X POST $URL/api/v1/api-keys -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{ "name": "Production server" }'
# → { "apiKey": { "apiKey": "ns_pk_...", "apiSecret": "ns_sk_..." } }
```

**3. Send notifications from your backend**

```bash
curl -X POST $URL/api/v1/notifications \
  -H "X-API-Key: ns_pk_..." -H "X-API-Secret: ns_sk_..." \
  -H "Idempotency-Key: order-1001-shipped" \
  -H "Content-Type: application/json" -d '{
    "channel": "EMAIL",
    "recipient": { "id": "user_123", "email": "customer@example.com" },
    "subject": "Your order has shipped",
    "message": "Order #1001 is on its way.",
    "metadata": { "orderId": "1001" }
  }'
# → 202 { "notification": { "id": "...", "status": "PENDING" } }
```

#### Windows PowerShell

The same three steps with PowerShell's built-in `Invoke-RestMethod` (paste the whole block):

```powershell
$URL = "http://localhost:5000"

# 1. Register your business (use /api/v1/auth/login with email + password if it already exists)
$reg = Invoke-RestMethod -Method Post "$URL/api/v1/auth/register" -ContentType "application/json" `
  -Body (@{ businessName = "Acme Stores"; name = "Ada"; email = "ada@acme.com"; password = "Password123" } | ConvertTo-Json)

# 2. Create an API key
$key = Invoke-RestMethod -Method Post "$URL/api/v1/api-keys" -Headers @{ Authorization = "Bearer $($reg.token)" } `
  -ContentType "application/json" -Body '{"name":"Production server"}'
$api = @{ "X-API-Key" = $key.apiKey.apiKey; "X-API-Secret" = $key.apiKey.apiSecret }

# 3. Send a notification
$n = Invoke-RestMethod -Method Post "$URL/api/v1/notifications" -Headers ($api + @{ "Idempotency-Key" = "order-1001-shipped" }) `
  -ContentType "application/json" `
  -Body (@{ channel = "EMAIL"; recipient = @{ id = "user_123"; email = "customer@example.com" }; subject = "Your order has shipped"; message = "Order #1001 is on its way." } | ConvertTo-Json)

# Check the status a few seconds later
Start-Sleep 3
(Invoke-RestMethod "$URL/api/v1/notifications/$($n.notification.id)" -Headers $api).notification |
  Select-Object channel, status, provider, to
```

Node.js example:

```js
const res = await fetch(`${process.env.NOTIFY_URL}/api/v1/notifications`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.NOTIFY_API_KEY,
    "X-API-Secret": process.env.NOTIFY_API_SECRET,
    "Idempotency-Key": `welcome-${user.id}`,
  },
  body: JSON.stringify({
    channel: "IN_APP",
    recipient: { id: user.id },
    subject: "Welcome!",
    message: "Thanks for signing up.",
  }),
});
```

> **Keep the API secret on your server.** Never put it in browser or mobile app code. For
> in-app notifications, your backend fetches `GET /api/v1/recipients/:id/inbox` and passes the
> result to your app.

### Recipients and channels

`recipient.id` is **your own user ID**. The first time you use it, a recipient record is created.
After that you can send by ID alone, and the stored email or phone is used.

| Channel | Needs | Notes |
|---|---|---|
| `EMAIL` | `recipient.email` (or a stored email) and `subject` | Sender name is your business name |
| `SMS` | `recipient.phone` in E.164 format, e.g. `+2348012345678` (or a stored phone) | Max 1600 characters |
| `IN_APP` | `recipient.id` | Appears in that recipient's inbox; mark read with `PATCH /notifications/:id/read` |

Add `"scheduledAt": "2026-10-01T09:00:00Z"` to send later.

### Notification statuses

| Status | Meaning |
|---|---|
| `PENDING` | Accepted and waiting to be sent (or waiting for a retry / scheduled time) |
| `PROCESSING` | A worker is sending it now |
| `SENT` | The provider accepted it (SMTP server / Twilio) |
| `DELIVERED` | Delivery confirmed: in-app inbox, or Twilio delivery report |
| `FAILED` | Permanent failure or retries exhausted. See `failureReason`; retry with `POST /notifications/:id/retry` |

`GET /api/v1/notifications/:id` returns the full `events` history.

---

## API overview

Full request/response details are in **`/docs`**.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/register` | none | Register a business + first user |
| `POST /api/v1/auth/login` | none | Dashboard login: sets the session cookie and returns a JWT |
| `POST /api/v1/auth/login/mfa` | none | Second sign-in step when two-factor is on (`mfaToken` + code) |
| `GET /api/v1/auth/me` | JWT | Current user and business |
| `POST /api/v1/auth/logout` | JWT | End every session of the user (all their tokens stop working) |
| `PATCH /api/v1/account`, `POST /api/v1/account/password` | JWT | Update your name, change your password |
| `POST /api/v1/account/mfa/setup`, `/enable`, `/disable` | JWT | Turn two-factor authentication on or off |
| `PATCH /api/v1/account/business`, `GET /api/v1/account/settings` | JWT | Business details; delivery channels and limits |
| `POST/GET /api/v1/api-keys`, `DELETE /api/v1/api-keys/:id` | JWT | Create, list, revoke API keys |
| `POST /api/v1/notifications` | API key or JWT | Send a notification |
| `POST /api/v1/notifications/bulk` | API key or JWT | Send up to 100 notifications in one request |
| `POST/GET /api/v1/schedules` | API key or JWT | Create / list recurring schedules |
| `GET/PATCH/DELETE /api/v1/schedules/:id` | API key or JWT | View, change, pause/resume or delete a schedule |
| `POST /api/v1/schedules/:id/run` | API key or JWT | Send a schedule's message now |
| `GET /api/v1/notifications` | API key or JWT | List with `search`, `channel`, `status`, `recipientId`, `from`, `to`, `page`, `limit` |
| `GET /api/v1/notifications/stats` | API key or JWT | Counts by status and channel, in-app read count |
| `GET /api/v1/notifications/usage` | API key or JWT | Your plan, notifications used this month, remaining, reset date |
| `GET /api/v1/notifications/:id` | API key or JWT | Details + status history |
| `PATCH /api/v1/notifications/:id/read` | API key or JWT | Mark in-app notification read |
| `POST /api/v1/notifications/:id/retry` | API key or JWT | Retry a failed notification |
| `POST/GET /api/v1/recipients` | API key or JWT | Upsert / list recipients |
| `GET/PATCH/DELETE /api/v1/recipients/:externalId` | API key or JWT | Manage one recipient |
| `GET /api/v1/recipients/:externalId/inbox` | API key or JWT | In-app inbox (`unread=true` supported) |
| `GET /api/v1/admin/businesses`, `PATCH /api/v1/admin/businesses/:id` | ADMIN | List (filter by `status` or `plan`) / suspend / reactivate businesses, change a business's plan (`{ "plan": "STARTER" }`) |
| `GET /api/v1/admin/notifications`, `/admin/stats`, `/admin/businesses/:id/stats` | ADMIN | Platform monitoring (per-business stats include plan usage) |
| `POST /api/v1/webhooks/twilio/status` | Twilio signature | SMS delivery reports |
| `GET /api/v1/plans`, `GET /api/v1/support` | none | Plans on offer; support contact for the Help page |
| `GET /health` | none | Liveness, database status and the deployed Git commit |

All responses use `{ "success": true|false, ... }`. Validation errors include an `errors` array
of `{ field, message }`.

**Monthly limits.** Each plan allows a number of notifications per calendar month (UTC). Once it is
used up, new notifications get **429** with `"code": "MONTHLY_LIMIT_REACHED"` and a message saying
when the limit resets (the per-minute rate limits also use 429, without a `code`). Notifications
already accepted are still delivered; retries and repeated `Idempotency-Key` requests do not count.
In a bulk request, the items that fit are accepted and the rest are reported in `results`.
Recurring schedules skip a run when nothing is left and record why in `lastRun`. A platform admin
changes a plan with `PATCH /api/v1/admin/businesses/:id` and `{ "plan": "STARTER" }` (for example
from Swagger at `/docs`); the new limit applies at once.

"JWT" means either the `ns_session` cookie (set by login, used by the dashboard) or an
`Authorization: Bearer <token>` header. Requests that change data using the cookie must also send
`X-Requested-With: XMLHttpRequest`, which other websites cannot add (CSRF protection).

---

## Configuration

All settings are environment variables, documented in [.env.example](.env.example).
Providers default to `console` (logged, not sent), so the service runs with no third-party
accounts. Switch to real delivery with `EMAIL_PROVIDER=smtp` and `SMS_PROVIDER=twilio`;
see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#4-turn-on-real-delivery-optional).

---

## Deployment

The live demo runs on Render's free plan with a MongoDB Atlas database. Every merge to `main`
is deployed by GitHub Actions:

```text
merge to main ──► test (npm audit + 122 tests) ──► docker build ──► deploy
                                                                       │
     Render deploy hook, pinned to the tested commit ◄─────────────────┘
     then wait until GET /health reports that commit ("commit": "<sha>")
```

- Nothing is deployed unless the tests and the Docker build pass.
- The `deploy` job fails with a clear message if the deploy hook is not configured, or if the
  new version is not live within 15 minutes, so an undeployed merge is never silent.
- Deploys show under the repository's **Deployments → production**.
- To check what is live: `curl https://notifyflow-labu.onrender.com/health`.
- To deploy by hand or roll back: **Manual Deploy** in the Render dashboard.

GitHub Actions deploys instead of Render because the Render service was created from the
repository's public URL, and Render cannot auto-deploy those. One-time setup (a Render deploy
hook saved as the `RENDER_DEPLOY_HOOK_URL` repository secret) is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#automatic-deploys).

---

## Real email and SMS with free trials

No code changes are needed: add the settings below as environment variables (on Render:
your service → **Environment**; locally: your `.env` file, then restart `npm run dev`).
Email and SMS are independent, so you can turn on just one.

### Email with Brevo (free plan, about 300 emails a day)

1. Sign up at [brevo.com](https://www.brevo.com). If Brevo asks you to complete your profile
   or confirm your account, do that first; new accounts can't send until they are activated.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**, and confirm the address from
   the email Brevo sends you. This is the address your notifications come from.
3. **SMTP & API → SMTP**: note the **Login** (looks like `123abc@smtp-brevo.com`) and click
   **Generate a new SMTP key**. Copy the key; Brevo shows it only once.
4. Add these settings:

   | Variable | Value |
   |---|---|
   | `EMAIL_PROVIDER` | `smtp` |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_PORT` | `2525` (Render's free plan blocks 587; elsewhere 587 also works) |
   | `SMTP_SECURE` | `false` |
   | `SMTP_USER` | the Login from step 3 |
   | `SMTP_PASS` | the SMTP key from step 3 |
   | `EMAIL_FROM` | the sender address you confirmed in step 2 |

Emails from a free address (e.g. Gmail) sent through Brevo often land in spam. For real use,
add your own domain under **Senders, Domains & Dedicated IPs → Domains** and create the DNS
records Brevo shows you, then use an address on that domain as `EMAIL_FROM`.

### SMS with Twilio (free trial credit)

1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and verify your email
   and your own phone number.
2. In the Twilio Console, click **Get a phone number** (a free trial number).
3. On the Console home page, under **Account Info**, copy the **Account SID** and **Auth Token**.
4. **Phone Numbers → Manage → Verified Caller IDs**: add every phone you want to text during the
   trial. A trial account can only send to verified numbers.
5. **Messaging → Settings → Geo permissions**: tick the countries you will send to (for example
   Nigeria), or Twilio rejects those numbers.
6. Add these settings:

   | Variable | Value |
   |---|---|
   | `SMS_PROVIDER` | `twilio` |
   | `TWILIO_ACCOUNT_SID` | the Account SID (starts with `AC`) |
   | `TWILIO_AUTH_TOKEN` | the Auth Token |
   | `TWILIO_FROM_NUMBER` | your Twilio number in international format, e.g. `+15551234567` |
   | `PUBLIC_BASE_URL` | your service's public URL, e.g. `https://notifyflow-labu.onrender.com` |

With `PUBLIC_BASE_URL` set, Twilio reports each delivery back, so SMS notifications move from
**Sent** to **Delivered**; the callback is verified with your Auth Token. Trial messages start
with "Sent from your Twilio trial account". To text any number, upgrade the Twilio account (you
pay per message). Some countries, including Nigeria, filter messages from unregistered senders,
so check Twilio's country guidelines before relying on SMS in production.

### Check that it works

Send a test from the dashboard to your own email address and verified phone. In **Activity**,
the email shows **Sent** and the SMS **Sent**, then **Delivered**. If something is wrong, the
notification shows **Failed** with the provider's error (for example a wrong SMTP key or an
unverified number). Fix the setting, then click **Retry** on that notification.

---

## Security

- API secrets are 256-bit random values stored only as SHA-256 hashes and compared in constant time.
- Passwords are hashed with bcrypt; login returns the same error for unknown email and wrong password.
- Dashboard sessions use an HttpOnly, `SameSite=Strict` cookie (`Secure` in production), so scripts
  cannot read the token; cookie-authenticated changes also require the `X-Requested-With` header.
- JWTs are only accepted with HS256 and the expected issuer and audience. Logout increments a
  per-user token version, so every previously issued token stops working immediately; so does a
  password change (except on the device that made it).
- Optional two-factor authentication (TOTP, RFC 6238) with 10 one-time recovery codes. Secrets are
  encrypted with AES-256-GCM (`MFA_ENCRYPTION_KEY`), recovery codes are stored hashed, each code works
  once, and 5 wrong codes lock the code step for 15 minutes. The password step alone never creates a
  session: it returns a 5-minute token that is only accepted by `POST /auth/login/mfa`.
- A business can hold at most 10 active API keys (`MAX_ACTIVE_API_KEYS`).
- The dashboard is same-origin and runs under a strict Content-Security-Policy (no inline scripts
  or styles, no framing); it renders all API data as text, never as HTML.
- Logins, registrations, logouts, API key creation/revocation, business suspensions and plan
  changes are written as JSON audit lines (`"type":"audit"`) without passwords, tokens or secrets.
- Plan limits are enforced on the server for every way of sending (single, bulk, scheduled), and
  only a platform admin can change a business's plan.
- Every query is scoped to the caller's business; cross-tenant access is covered by tests.
- Suspended businesses are blocked on the next request (keys and tokens are checked against the database).
- Request bodies and queries are validated and typed, which blocks NoSQL operator injection; search input is regex-escaped.
- Every API request is rate limited per IP (before authentication), login/register more strictly, and each business has its own API quota.
- Cross-origin browser access is disabled unless `CORS_ORIGIN` lists your dashboard origins.
- Twilio callbacks are verified with the `X-Twilio-Signature` HMAC.
- Helmet security headers; internal errors are logged, never returned to clients.

---

## Testing

These commands work the same in bash and PowerShell:

```bash
npm install
docker run -d -p 27017:27017 --name mongo-test mongo:7
npm test
docker rm -f mongo-test     # when you're done
```

If port 27017 is already in use (for example by a local MongoDB), stop that first or point the
tests elsewhere with `TEST_DB_URL`.

122 tests run against a real MongoDB (override with `TEST_DB_URL`), covering auth,
sessions and logout, two-factor authentication (RFC 6238 test vectors, replay, lockout), JWT tampering, the dashboard CSP, API keys, sending on every channel,
bulk sends, recurring schedules (timezones, daylight saving, crash safety), retries and failures,
scheduling, crash recovery, idempotency, tenant isolation, plan limits (single, bulk and scheduled
sends, month boundaries, plan changes), admin controls, rate limits and webhook signatures. Providers are swapped for fakes, so no email
or SMS is sent; the SMTP provider itself is tested against in-process fake mail servers. GitHub Actions runs the tests, `npm audit` and a
Docker build on every pull request, and on `main` also deploys to Render (see [Deployment](#deployment)).

---

## Project structure

```text
├── app.js                      Express app: security middleware, routes, errors
├── src/
│   ├── server.js               Startup: env check, DB connect, worker, graceful shutdown
│   ├── docs.js                 Swagger UI at /docs
│   ├── config/                 Environment config and MongoDB connection
│   ├── models/                 Business, User, ApiKey, Recipient, Notification, Schedule
│   ├── validators/schemas.js   zod request schemas
│   ├── middleware/             JWT auth, API key auth, roles, rate limits, validation, errors
│   ├── routes/                 /api/v1 routers
│   ├── controllers/            Request handlers
│   ├── services/
│   │   ├── notificationService.js   Create (single and bulk), list, inbox, retry, stats
│   │   ├── usageService.js          Plans and monthly usage limits
│   │   ├── scheduleService.js       Runs due recurring schedules
│   │   ├── mfaService.js            Two-factor setup, codes, recovery codes, lockout
│   │   ├── deliveryWorker.js        Queue processing, retries, backoff, due schedules
│   │   └── providers/               console, smtp, twilio, in-app
│   └── utils/                  API keys, session cookie, audit log, recurrence rules, two-factor codes, encryption, HttpError
├── scripts/createAdmin.js      Create a platform admin
├── docs/                       openapi.yaml, DEPLOYMENT.md
├── test/                       Integration tests (node:test + supertest)
├── Dockerfile, docker-compose.yml, render.yaml
├── Notification-Service-Dashboard/frontend/   Business dashboard, served by the API at /
│   ├── index.html              Markup, navigation, forms, dialogs and tables
│   ├── app.js                  UI behavior and same-origin API client
│   ├── styles.css, auth.css    Layout, responsive design and component styles
│   └── README.md               Frontend documentation
└── .github/workflows/ci.yml    Tests, Docker build, deploy of main to Render
```

Express 5 forwards errors thrown in async handlers to `errorMiddleware` automatically, so
controllers throw `HttpError(status, message)` instead of using try/catch.

---

## Roadmap (beyond the MVP)

- Outbound webhooks so businesses are notified of status changes instead of polling
- Message templates with variables (`Hello {{name}}`)
- Per-business provider credentials and sender domains
- Per-key scopes (for example send-only keys)
- User notification preferences / opt-out
- Self-service plan upgrades with online payments (plans are assigned by the platform admin today)
- Opt-in link click tracking for email and SMS, and SMS reply tracking (Twilio inbound webhook)
- Email bounce and complaint tracking via provider webhooks

Email open tracking is deliberately not planned: it needs HTML emails with a tracking image,
and the numbers are unreliable because many email apps open or block images automatically. The
in-app read rate is the reliable engagement measure.

---

## Team

Backend capstone project. Contributors (from the Git history; update each role as needed):

| Member | Contribution |
|---|---|
| rachael1205 | Initial backend: authentication, JWT, notification API, search/filter/pagination, MongoDB integration |
| 3gerrr | DevOps and integration: testing, Docker, CI/CD, deployment, multi-tenant platform, delivery worker |
| Valentine_M | Repository setup |
| Adeshinayomi | Repository configuration |
| Bude1229 | Product features: Help & support page, in-app read rate, subscription plans and usage limits |
| Macfrancis C. Nwaigwe dashtech-c | Frontend Developer: Designed and implemented the Notification Service dashboard, including business registration/sign-in, API connection settings, API credential management, notification composer, delivery activity tracking, and responsive user interface styling. |

