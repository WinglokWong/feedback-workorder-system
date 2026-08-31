# Feedback Work Order System

A lightweight internal work order and feedback management system. The current production instance is available at `feedback.aisparkforce.com`.

## Features

- Create, view, filter, paginate, update, and delete work orders
- Pending, processing, and completed workflow states
- Separate undeployed and deployed release states
- System categories, reporters, dates, and 1–5 star urgency levels
- Image and file uploads with full-resolution preview, gallery navigation, and downloads
- Optional assignees and account-based work order visibility
- Content and attachment editing for creators and super administrators
- Administrator and super administrator roles
- Account creation, suspension, restoration, password changes, and password resets
- Filterable operation logs visible only to super administrators
- Responsive mobile interface and installable Web App support

## Technology

- React 19
- Vinext and Vite
- Cloudflare D1-compatible database storage
- Cloudflare R2-compatible attachment storage
- Wrangler

## Local Development

Node.js `>= 22.13.0` is required.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` after the development server starts. A test super administrator is created only for a fresh local development environment. Production deployments must provide `BOOTSTRAP_SUPERADMIN_USERNAME` and `BOOTSTRAP_SUPERADMIN_PASSWORD` through the runtime environment. Never store real credentials in source code or commit them to Git.

## Validation

```bash
npm test
```

The test command performs a production build before running regression checks for pages, API authorization, attachments, and critical interactions.

## Deployment

The `deploy/` directory contains example Nginx and systemd configuration files. Production data, attachments, sessions, passwords, and environment variables must not be committed to the repository.

Before deployment:

- Configure a strong initial super administrator password
- Configure persistent database and attachment storage
- Serve the application over HTTPS
- Restrict access to the server and persistence directories

## Security Notes

- All work order pages require authentication
- Work order and attachment permissions are enforced by server-side APIs
- Passwords are stored using PBKDF2 with random salts
- Session cookies use `HttpOnly` and `SameSite=Lax`; production cookies also use `Secure`
- `.env*`, build output, and local persistence data are excluded through `.gitignore`
