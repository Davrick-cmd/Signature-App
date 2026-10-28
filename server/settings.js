// Runtime settings edited in Admin → Settings. Environment variables provide the
// defaults; saved values override them. Secrets are encrypted at rest.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const SECRET_FIELDS = ['email.smtpPass', 'email.brevoApiKey'];

function defaults() {
  return {
    general: {
      appUrl: config.appUrl,
      emailDomain: config.emailDomain,
      adminEmails: config.adminEmails,
    },
    email: {
      // none | smtp | brevo
      transport: config.smtp.host ? 'smtp' : 'none',
      smtpHost: config.smtp.host,
      smtpPort: config.smtp.port,
      smtpSecure: config.smtp.secure,
      smtpUser: config.smtp.user,
      smtpPass: config.smtp.pass,
      brevoApiKey: '',
      fromName: config.appName,
      fromEmail: (config.mailFrom.match(/<([^>]+)>/) || [, config.mailFrom])[1],
    },
    auth: {
      local: config.authProviders.includes('local'),
      ldap: config.authProviders.includes('ldap'),
      ldapUrl: config.ldap.url,
      ldapDomain: config.ldap.domain,
      ldapBaseDn: config.ldap.baseDn,
      ldapVerifyTls: true,
    },
    security: {
      sessionHours: parseInt(String(config.jwtExpiresIn).replace(/h$/, ''), 10) || 8,
      minPasswordLength: 10,
    },
  };
}

const key = crypto.createHash('sha256').update(process.env.SETTINGS_KEY || config.jwtSecret).digest();

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) return value;
  try {
    const raw = Buffer.from(value.slice(4), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    console.warn('⚠️  A saved secret could not be decrypted (was JWT_SECRET/SETTINGS_KEY changed?). Re-enter it in Admin → Settings.');
    return '';
  }
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  keys.slice(0, -1).reduce((o, k) => (o[k] = o[k] || {}), obj)[keys.at(-1)] = value;
};

function merge(base, saved) {
  const out = structuredClone(base);
  for (const [section, values] of Object.entries(saved || {})) {
    if (out[section] && values && typeof values === 'object') Object.assign(out[section], values);
  }
  return out;
}

let saved = {};
let current = defaults();

async function loadSettings() {
  const [rows] = await db.query("SELECT text_value FROM app_settings WHERE name = 'settings'");
  saved = rows[0]?.text_value ? JSON.parse(rows[0].text_value) : {};
  const decrypted = structuredClone(saved);
  for (const field of SECRET_FIELDS) {
    const v = getPath(decrypted, field);
    if (v !== undefined) setPath(decrypted, field, decrypt(v));
  }
  current = merge(defaults(), decrypted);
  return current;
}

// Synchronous: settings are loaded at startup and refreshed after every save
const getSettings = () => current;

// Settings as shown to admins: secrets are replaced by "is it set?" flags
function publicSettings() {
  const out = structuredClone(current);
  for (const field of SECRET_FIELDS) {
    setPath(out, `${field}Set`, !!getPath(out, field));
    setPath(out, field, '');
  }
  return out;
}

const ALLOWED = {
  general: { appUrl: 'url', emailDomain: 'domain', adminEmails: 'emails' },
  email: {
    transport: ['none', 'smtp', 'brevo'], smtpHost: 'string', smtpPort: 'port', smtpSecure: 'bool',
    smtpUser: 'string', smtpPass: 'secret', brevoApiKey: 'secret', fromName: 'string', fromEmail: 'email',
  },
  auth: { local: 'bool', ldap: 'bool', ldapUrl: 'ldapUrl', ldapDomain: 'domain', ldapBaseDn: 'string', ldapVerifyTls: 'bool' },
  security: { sessionHours: [1, 720], minPasswordLength: [8, 128] },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(rule, value, name) {
  const fail = (msg) => { throw Object.assign(new Error(`${name}: ${msg}`), { status: 400 }); };
  if (Array.isArray(rule) && typeof rule[0] === 'string') {
    if (!rule.includes(value)) fail(`must be one of ${rule.join(', ')}`);
    return value;
  }
  if (Array.isArray(rule)) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < rule[0] || n > rule[1]) fail(`must be a whole number from ${rule[0]} to ${rule[1]}`);
    return n;
  }
  switch (rule) {
    case 'bool': return value === true || value === 'true';
    case 'port': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) fail('must be a valid port');
      return n;
    }
    case 'url':
      if (value && !/^https?:\/\/[^\s]+$/i.test(value)) fail('must start with http:// or https://');
      return String(value || '').trim().replace(/\/$/, '');
    case 'ldapUrl':
      if (value && !/^ldaps?:\/\/[^\s]+$/i.test(value)) fail('must start with ldap:// or ldaps://');
      return String(value || '').trim();
    case 'domain':
      if (value && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value).trim())) fail('must be a domain like example.com');
      return String(value || '').trim().toLowerCase();
    case 'email':
      if (value && !EMAIL_RE.test(String(value).trim())) fail('must be a valid email address');
      return String(value || '').trim();
    case 'emails': {
      const list = (Array.isArray(value) ? value : String(value || '').split(/[,\s]+/)).map((v) => v.trim().toLowerCase()).filter(Boolean);
      const bad = list.filter((v) => !EMAIL_RE.test(v));
      if (bad.length) fail(`invalid email ${bad.join(', ')}`);
      return list;
    }
    default:
      return String(value ?? '').trim().slice(0, 500);
  }
}

// Applies a partial update. Empty secret fields keep the stored secret; send
// clearSecrets: ["email.smtpPass"] to remove one.
async function updateSettings(patch, clearSecrets = []) {
  const next = structuredClone(saved);
  for (const [section, fields] of Object.entries(ALLOWED)) {
    for (const [name, rule] of Object.entries(fields)) {
      const value = patch?.[section]?.[name];
      if (value === undefined) continue;
      if (rule === 'secret') {
        if (value === '' || value === null) continue;
        setPath(next, `${section}.${name}`, encrypt(String(value)));
      } else {
        setPath(next, `${section}.${name}`, clean(rule, value, `${section}.${name}`));
      }
    }
  }
  for (const field of clearSecrets) {
    if (SECRET_FIELDS.includes(field)) setPath(next, field, '');
  }

  // Never allow a configuration nobody can sign in with
  const auth = { ...current.auth, ...next.auth };
  if (!auth.local && !auth.ldap) throw Object.assign(new Error('Enable at least one sign-in method'), { status: 400 });
  if (auth.ldap && !(auth.ldapUrl && auth.ldapDomain)) {
    throw Object.assign(new Error('LDAP needs a server URL and a domain'), { status: 400 });
  }

  await db.query(
    `INSERT INTO app_settings (name, text_value) VALUES ('settings', ?)
     ON DUPLICATE KEY UPDATE text_value = VALUES(text_value)`,
    [JSON.stringify(next)]
  );
  await loadSettings();
  return publicSettings();
}

module.exports = { loadSettings, getSettings, publicSettings, updateSettings };
