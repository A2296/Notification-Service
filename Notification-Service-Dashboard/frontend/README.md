# NotifyFlow Frontend Dashboard

NotifyFlow is the frontend dashboard for the Notification Service platform. It gives registered businesses one place to authenticate, configure their API connection, send email, SMS, and in-app notifications, manage API credentials, and monitor notification delivery activity.

The dashboard is dependency-free: it is built with standard HTML, CSS, and JavaScript and communicates with the Node.js/Express backend through configurable HTTP API endpoints.

## Features

- Business registration and sign-in interface
- Dashboard overview of sent, delivered, pending, and failed notifications
- Notification composer for email, SMS, and in-app channels
- Delivery-activity table with search and status filters
- API credential screen with a copyable API request example
- Configurable backend API URL and bearer-token connection
- Demo mode for reviewing the interface without a running backend
- Responsive layout for desktop and mobile devices
- Accessible form labels and semantic status output

## Technology

| Area | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3 |
| Interactivity and API requests | Vanilla JavaScript (ES6+) |
| Backend integration | REST API using `fetch` |

## Project Structure

```text
frontend/
├── index.html      # Dashboard markup, navigation, forms, dialogs, and tables
├── app.js          # UI behavior, API client, authentication, and notification actions
├── styles.css      # Main dashboard layout, responsive design, and component styles
├── auth.css        # Authentication-specific styles
└── README.md       # Frontend documentation and setup instructions
```

## Getting Started

### Prerequisites

- A modern web browser
- Node.js and npm (recommended for serving the site locally)
- A running Notification Service backend for live API features

### Run Locally

From the `frontend` directory, run one of the following commands:

```bash
npx serve .
# or
npx http-server .
```

Open the local URL shown in the terminal. You can also open `index.html` directly in a browser for a visual demo, but a local server is recommended for normal browser API behavior.

## Connecting the Backend

1. Open the dashboard.
2. Select **Connection settings** in the sidebar.
3. Enter the deployed Express API base URL, for example `http://localhost:5000`.
4. Enter a bearer token when the backend requires one.
5. Save the connection and refresh the activity page.

Connection settings are stored only in the current browser's `localStorage`.

## Expected API Endpoints

The API adapter is centralized in `app.js`. Update the paths there if the backend uses different routes.

| Feature | HTTP request | Expected response |
| --- | --- | --- |
| Read notifications | `GET /api/notifications?limit=50` | An array, or an object containing `notifications` or `data` |
| Send notification | `POST /api/notifications` | A notification with `id`/`_id` and `status` |
| Register business | `POST /api/auth/register` | `token` or `accessToken` |
| Sign in business | `POST /api/auth/login` | `token` or `accessToken` |
| Create API key | `POST /api/api-keys` | `key` or `apiKey` |

### Request Payloads

Send a notification:

```json
{
  "channel": "email",
  "recipient": "user@example.com",
  "referenceId": "order_10482",
  "subject": "Order shipped",
  "message": "Your order is on its way."
}
```

Register a business:

```json
{
  "businessName": "Acme Inc.",
  "email": "admin@acme.com",
  "password": "your-secure-password"
}
```

## Security Notes

- Do not put a production API secret in frontend code, a public repository, or browser storage.
- Use authenticated user sessions or short-lived bearer tokens for dashboard requests.
- Configure the Express backend's CORS policy to allow the dashboard's deployed URL.
- Always use HTTPS for deployed frontend and backend environments.

## Team Contributions

| Team Member | GitHub | Role | Contribution |
| --- | --- | --- | --- |
| Macfrancis C. Nwaigwe | dashtech-c | [@A2296](https://github.com/A2296) | Frontend Developer | Designed and implemented the Notification Service dashboard, including business registration/sign-in, API connection settings, API credential management, notification composer, delivery activity tracking, and responsive user interface styling. |

## License

This project follows the license of the parent Notification Service repository.
