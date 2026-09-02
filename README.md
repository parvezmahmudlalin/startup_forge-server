# StartupForge API

REST API and backend services for the StartupForge platform.

## Features

* Authentication & authorization
* JWT-based protected APIs
* Role-based access control
* Startup & opportunity management
* Application management
* Search with MongoDB `$regex`
* Filtering with MongoDB `$in`
* Server-side pagination
* Stripe Checkout & transactions
* Admin management
* CORS & centralized error handling

## Tech Stack

**Node.js · Express.js · MongoDB · Better Auth · JWT · Stripe**

## Database

```text
users
startups
opportunities
applications
payments
```

## Setup

```bash
git clone https://github.com/parvezmahmudlalin/startup_forge-server.git
cd startup_forge-server
npm install
```

Create `.env`:

```env
PORT=5000
MONGODB_URI=
CLIENT_URL=
STRIPE_SECRET_KEY=
```

Start development:

```bash
npm run dev
```

Runs at `http://localhost:5000`.

## Security

* Environment-based secrets
* HTTPOnly authentication cookies
* JWT verification
* Protected routes
* Role-based authorization
* CORS configuration

## Frontend

https://github.com/parvezmahmudlalin/startup_forge-client

## Live Application

https://startupforge-app.vercel.app
