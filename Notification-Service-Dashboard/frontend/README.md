# NotifyFlow frontend

A dependency-free, responsive dashboard for a notification-service backend. It can run by opening `index.html` in a browser; using a local static server is recommended so browser requests work normally.

## Features

- Delivery overview with email, SMS and in-app statuses
- Send-notification form
- Searchable activity history
- API-key screen and copyable `curl` example
- Business registration and sign-in form
- Backend URL and bearer token stored only in the current browser's `localStorage`
- Demo mode when no API URL is set

## Connecting the Express backend

1. Open the dashboard and select **Connection settings**.
2. Enter the public backend address, for example `http://localhost:5000`.
3. Optionally enter the bearer token used by the backend.

The API adapter lives at the top of `app.js`. It expects these conventional endpoints, which can be changed in one place if the project uses different names:

| Feature | HTTP request |
| --- | --- |
| Read notifications | `GET /api/notifications?limit=50` |
| Send a notification | `POST /api/notifications` |
| Create an API key | `POST /api/api-keys` |
| Register a business | `POST /api/auth/register` |
| Sign in a business | `POST /api/auth/login` |

The send body is `{ channel, recipient, referenceId, subject, message }`. The activity reader accepts either an array or an object with `notifications` or `data`. Registration sends `{ businessName, email, password }`; sign-in sends `{ email, password }`. Both should return a `token` or `accessToken`.

