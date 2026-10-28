// Sets a deployment's logo and product name through the API (same as Admin → Settings → Branding).
// Usage: SEED_BASE=https://customer-app.onrender.com SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
//        node scripts/set-branding.js <logo.png|jpg> ["Product name"]
const fs = require('fs');
const path = require('path');

const BASE = (process.env.SEED_BASE || 'http://localhost:3001').replace(/\/$/, '');
const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
const [logoPath, displayName] = process.argv.slice(2);

if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || !logoPath) {
  console.error('Usage: SEED_BASE=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/set-branding.js <logo> ["Product name"]');
  process.exit(1);
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }),
  });
  const { token, error } = await login.json();
  if (!token) throw new Error(`Sign-in failed: ${error}`);

  const type = /\.jpe?g$/i.test(logoPath) ? 'image/jpeg' : 'image/png';
  const form = new FormData();
  form.append('logo', new Blob([fs.readFileSync(logoPath)], { type }), path.basename(logoPath));
  if (displayName !== undefined) form.append('displayName', displayName);

  const res = await fetch(`${BASE}/api/admin/branding`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  console.log(`✅ Branding set: ${data.displayName}${data.logoUrl ? ' (logo uploaded)' : ''}`);
})().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
