# SignFlow

Self-hosted electronic signature platform. Upload a PDF, place signature fields, and route it to signers in order. SignFlow emails each signer when it's their turn, stamps the signatures into the PDF and keeps a full audit trail.

## Features

- **Sequential multi-signer workflows**: signers are notified one at a time, in order
- **Drag-and-drop field placement**: signature, initials, date and text fields on any page
- **Final signed PDF**: signatures are embedded in the original document at the exact positions
- **Decline and expiry**: signers can decline with a reason; documents can auto-expire
- **Email notifications** for requests, reminders, signatures, completion, declines and expiry
- **Sign-in with local accounts, Active Directory / LDAP, or both**
- **Admin console**: users, roles, usage statistics and an activity log
- **Audit trail**: every upload, send, view, signature, download and login, with IP and user agent

## Security model

- Server-issued, signed session tokens (JWT); identity is never taken from the request body
- Every document route checks ownership/signer membership; admins are enforced server-side
- Files are only served through authorised endpoints; there is no public upload folder
- Signing order is enforced in a database transaction, which prevents race conditions
- Field positions are locked once signing begins; signers can only fill their own fields
- Uploads are checked for type, size and file signature (magic bytes)
- Passwords are hashed with scrypt; LDAP filters and email content are escaped
- Helmet security headers (CSP), rate limiting on login and signing

## Tech stack

| Layer    | Technology                                 |
|----------|--------------------------------------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, react-pdf |
| Backend  | Node.js 18+, Express 5, pdf-lib, Nodemailer |
| Database | MySQL 8+                                    |
| Auth     | Local accounts (scrypt) and/or LDAP / Active Directory |

## Quick start (Docker)

```bash
cp .env.example .env
# edit .env: set DB_PASSWORD, JWT_SECRET, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --build
```

Open http://localhost:3001 and sign in with the bootstrap admin account.

Add more local users:

```bash
docker compose exec app node scripts/create-user.js jane@example.com "Jane Doe"
docker compose exec app node scripts/create-user.js ops@example.com "Ops Admin" --admin
```

## Local development

Requires Node 18+ and a MySQL 8 database.

```bash
npm install && npm run install:all
cp .env.example server/.env          # point DB_* at your MySQL
npm run init-db --prefix server      # creates tables (safe to re-run)
npm run dev                          # API on :3001, web app on :5173
```

## Configuration

All settings are environment variables; see [.env.example](.env.example) for the full list. The most important ones:

| Variable | Purpose |
|----------|---------|
| `APP_URL` | Public URL of the app (used in email links and CORS) |
| `JWT_SECRET` | Random string, at least 32 characters. Required in production |
| `AUTH_PROVIDERS` | `local`, `ldap` or `local,ldap` |
| `LDAP_URL`, `LDAP_DOMAIN` | Active Directory connection |
| `ADMIN_EMAILS` | Emails that always receive the admin role |
| `SMTP_*`, `MAIL_FROM` | Outgoing email. If `SMTP_HOST` is empty, emails are written to the log |

## Project structure

```
frontend/   React app (built into frontend/dist and served by the API in production)
server/     Express API
  index.js        routes
  auth.js         sign-in, sessions, permissions
  mailer.js       email templates and delivery
  schema.sql      database schema
  scripts/        init-db, create-user
Dockerfile, docker-compose.yml
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production hosting.
