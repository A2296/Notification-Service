# NotifyFlow Frontend Dashboard

NotifyFlow is the frontend dashboard for the Notification Service platform. It gives registered businesses one place to sign up, send email, SMS, and in-app notifications, monitor delivery activity, and manage the API keys their own servers use.

The dashboard is dependency-free: it is built with standard HTML, CSS, and JavaScript. The Notification Service serves it directly, so it talks to the API on the same origin with no configuration.

## Features

- Business registration and sign-in; sign-out ends the session on the server
- Overview of total, sent/delivered, in-progress, and failed notifications
- Notification composer for email, SMS, and in-app channels, with per-channel validation
- Duplicate-send protection: a retried send reuses its `Idempotency-Key`
- Delivery-activity table with server-side search and status filters
- API key management: generate (the secret is shown once), list, and revoke keys
- Ready-to-run `curl` example using your key ID and the service's real URL
- Demo mode with sample data when the page is opened without the API
- Responsive layout for desktop and mobile devices
- Accessible form labels and semantic status output

## Technology

| Area | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3 |
| Interactivity and API requests | Vanilla JavaScript (ES2020+) |
| Backend integration | Same-origin REST calls with `fetch` and an HttpOnly session cookie |

## Project Structure

```text
frontend/
├── index.html      # Dashboard markup, navigation, forms, dialogs, and tables
├── app.js          # UI behavior, API client, authentication, and notification actions
├── styles.css      # Main dashboard layout, responsive design, and component styles
├── auth.css        # Authentication-specific styles
└── README.md       # Frontend documentation
```

## Getting Started

Start the Notification Service (see the [main README](../../README.md#quick-start)), then open its address in a browser:

- Docker: `docker compose up --build -d`, then open http://localhost:5000/
- Node.js: `npm run dev`, then open http://localhost:5000/

Select **Sign in → Create an account** to register a business, then go to **API credentials** to generate a key for your server.

### Demo mode

If the page is opened without the API behind it (for example `npx serve .` in this folder, or opening `index.html` directly), the dashboard shows sample data and does not send anything. The status pill in the top bar reads **Demo mode**.

## API Endpoints Used

All paths are relative to the page's own origin. The full reference is at `/docs`.

| Feature | HTTP request |
| --- | --- |
| Detect the API | `GET /health` |
| Current session | `GET /api/v1/auth/me` |
| Register business | `POST /api/v1/auth/register` |
| Sign in | `POST /api/v1/auth/login` |
| Sign out | `POST /api/v1/auth/logout` |
| Overview counts | `GET /api/v1/notifications/stats` |
| Activity | `GET /api/v1/notifications?limit=50&search=…&status=…` |
| Send notification | `POST /api/v1/notifications` (with an `Idempotency-Key` header) |
| List API keys | `GET /api/v1/api-keys` |
| Create API key | `POST /api/v1/api-keys` |
| Revoke API key | `DELETE /api/v1/api-keys/:id` |

### Request Payloads

Send a notification (the composer maps the recipient field to `email`, `phone`, or `id` by channel):

```json
{
  "channel": "EMAIL",
  "recipient": { "email": "user@example.com" },
  "subject": "Order shipped",
  "message": "Your order is on its way.",
  "metadata": { "referenceId": "order_10482" }
}
```

Register a business:

```json
{
  "businessName": "Acme Inc.",
  "name": "Ada Lovelace",
  "email": "admin@acme.com",
  "password": "at-least-8-characters"
}
```

## Security Notes

- The session token is stored by the browser in an HttpOnly, `SameSite=Strict` cookie. `app.js` never sees it, and nothing sensitive is written to `localStorage` or `sessionStorage`.
- Every request goes to the page's own origin, so the dashboard cannot be pointed at another server. Each request also sends `X-Requested-With: XMLHttpRequest`, which the API requires for cookie-authenticated changes (CSRF protection), and times out after 15 seconds.
- The API serves the page with a strict Content-Security-Policy: scripts and styles only from this origin (plus Google Fonts), no inline code, and no framing.
- All data from the API is rendered with `textContent`, never as HTML.
- An API secret is shown once, right after it is generated. Store it in your server's environment; never put it in browser or mobile code.
- Deploy behind HTTPS. In production the session cookie is marked `Secure`.

## Team Contributions

| Team Member | GitHub | Role | Contribution |
| --- | --- | --- | --- |
| Macfrancis C. Nwaigwe | [@dashtech-c](https://github.com/dashtech-c) | Frontend Developer | Designed and implemented the Notification Service dashboard, including business registration/sign-in, API connection settings, API credential management, notification composer, delivery activity tracking, and responsive user interface styling. |

## License

This project follows the license of the parent Notification Service repository.
