# Notification Service

A multi-tenant notification platform that other businesses and applications integrate with.
A business registers, gets an **API key and secret**, and calls one API to send **email**,
**SMS** and **in-app** notifications to its own users. The service validates each request,
identifies the business and recipient, delivers through the right provider, retries failures
and tracks every status change.

Built with Node.js, Express 5, MongoDB (Mongoose), Nodemailer and Twilio.

- **Interactive API docs:** `/docs` (Swagger UI), raw spec at `/openapi.json`
- **Deployment guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Features

| Area | What's included |
|---|---|
| Multi-tenancy | Business accounts; every record is scoped to its business and isolation is tested |
| Authentication | API key + secret for integrations (secret hashed, shown once, revocable, up to 10 active per business); dashboard sessions in an HttpOnly cookie (JWT bearer for scripts and Swagger) with server-side logout |
| Authorization | Business users vs. platform `ADMIN`; suspending a business blocks its keys and logins at once |
| Channels | `EMAIL` (any SMTP provider), `SMS` (Twilio), `IN_APP` (per-recipient inbox with read tracking) |
| Delivery | Background worker, automatic retries with exponential backoff, permanent-failure detection, crash recovery, scheduled sends |
| Tracking | `PENDING → PROCESSING → SENT → DELIVERED / FAILED`, with a timestamped event history per notification |
| Reliability | `Idempotency-Key` header prevents duplicate sends; manual retry of failed notifications |
| Recipients | Store your users' contact details once, then send by your own user ID |
| Validation | Every request is validated with zod and returns field-level error messages |
| Security | Helmet headers and a strict CSP for the dashboard, CSRF protection, per-IP login rate limit, per-business API rate limit, NoSQL/regex injection protection, bcrypt passwords, audit log |
| Dashboard | Business web dashboard served by the API at `/` (see below) |
| Operations | Docker, docker-compose (with a local email inbox), `/health`, graceful shutdown, GitHub Actions CI, Render blueprint |
| Docs & tests | OpenAPI 3 spec + Swagger UI; 64 integration tests |

---

## Frontend Features

The dashboard in [`Notification-Service-Dashboard/frontend`](Notification-Service-Dashboard/frontend)
is served by the API itself, so it is available at `http://localhost:5000/` (or your deployed URL)
with no separate hosting or configuration.

- Business registration and sign-in; sign-out ends the session on the server
- Overview of total, sent/delivered, in-progress and failed notifications
- Notification composer for email, SMS and in-app channels (with duplicate-send protection)
- Delivery-activity table with server-side search and status filters
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
| `GET /api/v1/auth/me` | JWT | Current user and business |
| `POST /api/v1/auth/logout` | JWT | End every session of the user (all their tokens stop working) |
| `POST/GET /api/v1/api-keys`, `DELETE /api/v1/api-keys/:id` | JWT | Create, list, revoke API keys |
| `POST /api/v1/notifications` | API key or JWT | Send a notification |
| `GET /api/v1/notifications` | API key or JWT | List with `search`, `channel`, `status`, `recipientId`, `from`, `to`, `page`, `limit` |
| `GET /api/v1/notifications/stats` | API key or JWT | Counts by status and channel |
| `GET /api/v1/notifications/:id` | API key or JWT | Details + status history |
| `PATCH /api/v1/notifications/:id/read` | API key or JWT | Mark in-app notification read |
| `POST /api/v1/notifications/:id/retry` | API key or JWT | Retry a failed notification |
| `POST/GET /api/v1/recipients` | API key or JWT | Upsert / list recipients |
| `GET/PATCH/DELETE /api/v1/recipients/:externalId` | API key or JWT | Manage one recipient |
| `GET /api/v1/recipients/:externalId/inbox` | API key or JWT | In-app inbox (`unread=true` supported) |
| `GET /api/v1/admin/businesses`, `PATCH /api/v1/admin/businesses/:id` | ADMIN | List / suspend / reactivate businesses |
| `GET /api/v1/admin/notifications`, `/admin/stats`, `/admin/businesses/:id/stats` | ADMIN | Platform monitoring |
| `POST /api/v1/webhooks/twilio/status` | Twilio signature | SMS delivery reports |
| `GET /health` | none | Liveness + database status |

All responses use `{ "success": true|false, ... }`. Validation errors include an `errors` array
of `{ field, message }`.

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

## Security

- API secrets are 256-bit random values stored only as SHA-256 hashes and compared in constant time.
- Passwords are hashed with bcrypt; login returns the same error for unknown email and wrong password.
- Dashboard sessions use an HttpOnly, `SameSite=Strict` cookie (`Secure` in production), so scripts
  cannot read the token; cookie-authenticated changes also require the `X-Requested-With` header.
- JWTs are only accepted with HS256 and the expected issuer and audience. Logout increments a
  per-user token version, so every previously issued token stops working immediately.
- A business can hold at most 10 active API keys (`MAX_ACTIVE_API_KEYS`).
- The dashboard is same-origin and runs under a strict Content-Security-Policy (no inline scripts
  or styles, no framing); it renders all API data as text, never as HTML.
- Logins, registrations, logouts, API key creation/revocation and business suspensions are written
  as JSON audit lines (`"type":"audit"`) without passwords, tokens or secrets.
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

64 integration tests run against a real MongoDB (override with `TEST_DB_URL`), covering auth,
sessions and logout, JWT tampering, the dashboard CSP, API keys, sending on every channel, retries and failures, scheduling, crash recovery,
idempotency, tenant isolation, admin controls and webhook signatures. Providers are swapped
for fakes, so no email or SMS is sent. GitHub Actions runs the tests, `npm audit` and a
Docker build on every pull request.

---

## Project structure

```text
├── app.js                      Express app: security middleware, routes, errors
├── src/
│   ├── server.js               Startup: env check, DB connect, worker, graceful shutdown
│   ├── docs.js                 Swagger UI at /docs
│   ├── config/                 Environment config and MongoDB connection
│   ├── models/                 Business, User, ApiKey, Recipient, Notification
│   ├── validators/schemas.js   zod request schemas
│   ├── middleware/             JWT auth, API key auth, roles, rate limits, validation, errors
│   ├── routes/                 /api/v1 routers
│   ├── controllers/            Request handlers
│   ├── services/
│   │   ├── notificationService.js   Create, list, inbox, retry, stats
│   │   ├── deliveryWorker.js        Queue processing, retries, backoff
│   │   └── providers/               console, smtp, twilio, in-app
│   └── utils/                  API key generation, session cookie, audit log, HttpError
├── scripts/createAdmin.js      Create a platform admin
├── docs/                       openapi.yaml, DEPLOYMENT.md
├── test/                       Integration tests (node:test + supertest)
├── Dockerfile, docker-compose.yml, render.yaml
├── Notification-Service-Dashboard/frontend/   Business dashboard, served by the API at /
│   ├── index.html              Markup, navigation, forms, dialogs and tables
│   ├── app.js                  UI behavior and same-origin API client
│   ├── styles.css, auth.css    Layout, responsive design and component styles
│   └── README.md               Frontend documentation
└── .github/workflows/ci.yml
```

Express 5 forwards errors thrown in async handlers to `errorMiddleware` automatically, so
controllers throw `HttpError(status, message)` instead of using try/catch.

---

## Roadmap (beyond the MVP)

- Outbound webhooks so businesses are notified of status changes instead of polling
- Message templates with variables (`Hello {{name}}`)
- Per-business provider credentials and sender domains
- Per-key scopes (for example send-only keys) and daily sending quotas per business
- Bulk sends and user notification preferences / opt-out
- Email open/bounce tracking via provider webhooks

---

## Team

Backend capstone project. Contributors (from the Git history; update each role as needed):

| Member | Contribution |
|---|---|
| rachael1205 | Initial backend: authentication, JWT, notification API, search/filter/pagination, MongoDB integration |
| 3gerrr | DevOps and integration: testing, Docker, CI/CD, deployment, multi-tenant platform, delivery worker |
| Valentine_M | Repository setup |
| Adeshinayomi | Repository configuration |
| Macfrancis C. Nwaigwe dashtech-c | Frontend Developer: Designed and implemented the Notification Service dashboard, including business registration/sign-in, API connection settings, API credential management, notification composer, delivery activity tracking, and responsive user interface styling. |

