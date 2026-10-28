# Deploying SignFlow

SignFlow ships as a single Docker image: the API also serves the web app. You need that image and a MySQL 8 database; documents are stored in the database, so no persistent disk is required.

## Free hosted demo: Render + Aiven MySQL

The app keeps documents in the database, so Render's free web service (which has no persistent disk) works.

1. **Database**: create a free MySQL service at [console.aiven.io](https://console.aiven.io) (Create service → MySQL → Free plan). When it shows *Running*, copy the **Service URI**. It looks like `mysql://avnadmin:…@….aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`.
2. **App**: open `https://render.com/deploy?repo=https://github.com/Davrick-cmd/Signature-App`, sign in, and fill in:
   - `DATABASE_URL`: the Service URI from step 1
   - `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`: your first admin login
3. Click **Apply**. The first build takes about 5–10 minutes. The app URL appears on the service page (`https://signflow-xxxx.onrender.com`).
4. Optional: load demo users and sample documents:
   ```bash
   cd server
   SEED_BASE=https://signflow-xxxx.onrender.com SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… DEMO_PASSWORD=… npm run seed-demo
   ```

Free Render services sleep after 15 minutes without traffic. The first visit after that takes about a minute.

**Email on Render's free plan:** Render blocks SMTP ports on free services, so Gmail SMTP will time out there. In Admin → Settings → Email delivery choose **Brevo** (free, sends over HTTPS, can send from a verified Gmail address). On a paid Render instance or your own server, Gmail SMTP works.

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

Back up the `db-data` Docker volume (documents are stored in the database).

## Option B: managed platform (Railway, Render, Fly.io)

1. Create a MySQL database (Railway has one built in; on other platforms use a managed MySQL such as Aiven, PlanetScale or AWS RDS).
2. Create a web service from this repository using the `Dockerfile`.
3. Set the environment variables from `.env.example` (or `DATABASE_URL`), plus `NODE_ENV=production` and `TRUST_PROXY=1`.
4. Deploy. Tables and the bootstrap admin are created automatically on first start.

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
- [ ] Daily backups of the database
