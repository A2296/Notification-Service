# Notification Service API

A backend notification service that allows authenticated users to create and track notifications through different delivery channels, including Email, SMS, and In-App notifications.

## Features

- User registration
- User login
- JWT authentication
- Role-based authorization
- Notification creation
- Email notifications
- SMS notifications
- In-App notifications
- Notification status tracking
- Notification search
- Channel filtering
- Status filtering
- Pagination
- Notification ownership protection
- Admin notification monitoring
- Request rate limiting
- HTTP security headers with Helmet
- CORS support
- Environment variable configuration
- Centralized error handling

---

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Token (JWT)
- bcryptjs
- Helmet
- CORS
- express-rate-limit
- Nodemon

---

## Project Structure

```text
NotificationService/
│
├── src/
│   ├── config/
│   │   └── db.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   └── notificationController.js
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── errorMiddleware.js
│   │   └── roleMiddleware.js
│   │
│   ├── models/
│   │   ├── notificationSchema.js
│   │   └── userSchema.js
│   │
│   ├── routes/
│   │   ├── adminRoutes.js
│   │   ├── authRoutes.js
│   │   └── notificationRoutes.js
│   │
│   ├── services/
│   │   ├── emailService.js
│   │   ├── inAppService.js
│   │   ├── notificationService.js
│   │   └── smsService.js
│   │
│   └── server.js
│
├── scripts/
│   └── createAdmin.js
├── test/
│   └── api.test.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── app.js
├── package.json
└── README.md


Prerequisites

Make sure you have installed:

Node.js
npm
MongoDB / MongoDB Atlas


## Getting Started

### Option A: Docker (recommended, no local MongoDB needed)

```bash
docker compose up --build -d
docker compose exec api npm run seed:admin   # creates admin@example.com / ChangeMe123
curl http://localhost:5000/health
```

### Option B: Local Node.js

```bash
npm install
cp .env.example .env          # then edit DB_CONNECTION_STRING and JWT_SECRET
npm run seed:admin            # optional: create an ADMIN user
npm run dev                   # or: npm start
```

The server refuses to start if `DB_CONNECTION_STRING` or `JWT_SECRET` is missing.

### Running tests

Tests are integration tests against a real MongoDB:

```bash
docker run -d -p 27017:27017 --name mongo-test mongo:7
npm test
```

Override the database with `TEST_DB_URL`. GitHub Actions runs the tests, `npm audit` and a Docker build on every push to `main` and on every pull request (`.github/workflows/ci.yml`).

### Health check

`GET /health` returns `200 {"status":"ok"}` when the database is connected, `503` otherwise.

---

API Endpoints
Authentication


Register User
POST

/api/auth/register

This endpoint creates a new user.

Request Body
{
  "name": "Rachael",
  "email": "rachael@example.com",
  "password": "Password123"
}
Successful Response
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "USER_ID",
    "name": "Rachael",
    "email": "rachael@example.com",
    "role": "USER"
  }
}
Login User

POST

/api/auth/login
Request Body
{
  "email": "rachael@example.com",
  "password": "Password123"
}
Successful Response
{
  "success": true,
  "message": "Login successful",
  "token": "JWT_TOKEN",
  "user": {
    "id": "USER_ID",
    "name": "Rachael",
    "email": "rachael@example.com",
    "role": "USER"
  }
}
Notifications

All notification endpoints require JWT authentication unless otherwise stated.

Use:

Authorization: Bearer YOUR_TOKEN
Create Notification

POST

/api/notifications
Request Body
{
  "recipient": "test@example.com",
  "channel": "EMAIL",
  "subject": "Test Notification",
  "message": "This is a test notification."
}
Supported Channels
EMAIL
SMS
IN_APP

The channel input is case-insensitive.

For example:

EMAIL
email
Email

are accepted.

Successful Response
{
  "success": true,
  "message": "Notification created successfully",
  "notification": {
    "id": "NOTIFICATION_ID"
  }
}
Get User Notifications

GET

/api/notifications

Returns notifications belonging to the authenticated user.

Search

Search notifications using:

/api/notifications?search=Welcome

Search checks:

recipient
subject
message
Channel Filtering

Filter notifications by channel:

/api/notifications?channel=EMAIL

Supported channels:

EMAIL
SMS
IN_APP

The channel filter is case-insensitive.

Status Filtering

Filter notifications by status:

/api/notifications?status=SENT

Supported statuses:

PENDING
SENT
FAILED

The status filter is case-insensitive.

Pagination

Pagination is supported using:

/api/notifications?page=1&limit=10
Pagination Parameters
Parameter	Description	Default
page	Page number	1
limit	Number of notifications per page	10
Example
/api/notifications?page=2&limit=5
Combining Filters

Search, channel, status, and pagination can be combined.

Example:

/api/notifications?search=Welcome&channel=IN_APP&status=SENT&page=1&limit=5
Get Notification by ID

GET

/api/notifications/:id

Example:

/api/notifications/NOTIFICATION_ID

A user can only access notifications belonging to their own account.

If the notification does not belong to the authenticated user, the API returns:

{
  "success": false,
  "message": "Notification not found"
}
Admin API

Admin endpoints require:

Valid JWT
ADMIN role
Get All Notifications

GET

/api/admin/notifications

This endpoint allows an administrator to monitor notifications across users.

A normal USER receives:

{
  "success": false,
  "message": "Access denied"
}
Notification Statuses

Notifications use the following statuses:

PENDING
SENT
FAILED
PENDING

The notification has been created but has not yet been marked as successfully delivered.

SENT

The notification service successfully completed the configured delivery operation.

FAILED

The delivery operation failed.

Notification Channels
Email

Email delivery is currently simulated by the email service.

SMS

SMS delivery is currently simulated by the SMS service.

In-App

In-app notification creation is handled by the in-app notification service.

Security

The API includes several security measures:

JWT authentication
Role-based authorization
Notification ownership checks
Password hashing with bcrypt
Helmet security headers
CORS
API rate limiting
Environment variables for sensitive configuration
Centralized error handling
Request validation
Rate Limiting

The API currently allows:

100 requests

per:

15 minutes

per IP address.

Error Handling

The API uses centralized error handling.

Internal server errors return:

{
  "success": false,
  "message": "Internal Server Error"
}

Internal error details are logged on the server rather than exposed to the API client.

User Roles

The API currently supports two roles:

USER
ADMIN
USER

A normal user can:

Register
Login
Create notifications
View their notifications
Search their notifications
Filter their notifications
Paginate their notifications
View their own notification details
ADMIN

An administrator can access the admin notification monitoring endpoint.

Development

Run the application in development mode:

npm run dev

The project uses Nodemon for automatic server restarts during development.

Author / Contribution

This project was developed as part of a backend capstone project.

My contribution includes the backend implementation of:

Authentication
JWT authorization
Notification creation
Notification delivery services
Notification tracking
Search and filtering
Pagination
Validation
Security middleware
Admin monitoring
MongoDB integration
API development






 