# Deploying SignFlow

SignFlow ships as a single Docker image: the API also serves the web app. You need that image, a MySQL 8 database and a persistent disk for uploaded files.

## Option A: one server (VPS) with Docker Compose

Works on any Linux VM (Hetzner, DigitalOcean, AWS Lightsail, Azure, an on-prem server).

```bash
git clone <repo> signflow && cd signflow
cp .env.example .env
# Set at least: APP_URL, DB_PASSWORD, JWT_SECRET, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, SMTP_*
docker compose up -d --build
```

Put a TLS reverse proxy in front (Caddy is the simplest):

```
sign.yourcompany.com {
  reverse_proxy localhost:3001
}
```

Then set `APP_URL=https://sign.yourcompany.com` and `TRUST_PROXY=1` in `.env`, and run `docker compose up -d`.

Back up the `db-data` and `uploads` Docker volumes.

## Option B: managed platform (Railway, Render, Fly.io)

1. Create a MySQL database (Railway has one built in; on other platforms use a managed MySQL such as Aiven, PlanetScale or AWS RDS).
2. Create a web service from this repository using the `Dockerfile`.
3. Attach a persistent volume mounted at `/app/server/uploads`.
4. Set the environment variables from `.env.example`, plus `NODE_ENV=production` and `TRUST_PROXY=1`.
5. Deploy. Tables and the bootstrap admin are created automatically on first start.

## Running a public demo

- Use `AUTH_PROVIDERS=local` and create demo accounts with `scripts/create-user.js`.
- Leave `SMTP_HOST` empty so no real emails go out; messages appear in the logs.
- Use only sample documents. Never upload real customer files to a demo.

## Production checklist

- [ ] `JWT_SECRET` is a fresh random value (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- [ ] Database password is unique and the database is not exposed to the internet
- [ ] HTTPS in front of the app, `APP_URL` uses `https://`, `TRUST_PROXY=1`
- [ ] SMTP credentials configured and `MAIL_FROM` uses a domain with SPF/DKIM
- [ ] For Active Directory, use `ldaps://`
- [ ] Remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment after the first sign-in
- [ ] Daily backups of the database and the uploads volume
