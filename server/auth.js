const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const ldap = require('ldapjs');
const config = require('./config');
const db = require('./db');
const { getSettings } = require('./settings');

const scrypt = promisify(crypto.scrypt);

// Turn a bare username into an email using the configured domain
function normalizeEmail(value) {
  if (!value) return '';
  const v = String(value).trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${getSettings().general.emailDomain || config.emailDomain}`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hex] = stored.split('$');
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// RFC 4515 escaping for values placed inside an LDAP filter
function escapeLdapFilter(value) {
  return String(value).replace(/[\\*()\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

// Resolves { user } on success or { error } with a reason (shown by the admin's "Test" button)
function ldapCheck(username, password) {
  const auth = getSettings().auth;
  return new Promise((resolve) => {
    const domain = auth.ldapDomain;
    const hasDomain = username.includes('@');
    const upn = hasDomain ? username : `${username}@${domain}`;
    const sam = hasDomain ? username.split('@')[0] : username;
    const baseDn = auth.ldapBaseDn || `dc=${domain.split('.').join(',dc=')}`;

    let client;
    try {
      client = ldap.createClient({
        url: auth.ldapUrl,
        timeout: 8000,
        connectTimeout: 8000,
        tlsOptions: { rejectUnauthorized: auth.ldapVerifyTls !== false },
      });
    } catch (err) {
      return resolve({ error: `Invalid LDAP URL: ${err.message}` });
    }
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { client.unbind(() => {}); } catch {}
      resolve(result);
    };
    client.on('error', (e) => finish({ error: `Could not connect to ${auth.ldapUrl}: ${e?.message || e}` }));
    client.on('connectTimeout', () => finish({ error: `Timed out connecting to ${auth.ldapUrl}` }));

    client.bind(upn, password, (bindErr) => {
      if (bindErr) {
        const unreachable = /timeout|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connect/i.test(bindErr.message);
        return finish({
          error: unreachable
            ? `Could not connect to ${auth.ldapUrl} (${bindErr.message}). Check the address, port and firewall.`
            : `Username or password rejected for ${upn} (${bindErr.message})`,
        });
      }

      const opts = {
        filter: `(sAMAccountName=${escapeLdapFilter(sam)})`,
        scope: 'sub',
        attributes: ['givenName', 'displayName', 'cn', 'mail', 'sAMAccountName'],
      };
      const timer = setTimeout(() => finish({ error: 'Directory search timed out' }), 8000);

      client.search(baseDn, opts, (searchErr, searchRes) => {
        if (searchErr) {
          clearTimeout(timer);
          return finish({ error: `Search failed under ${baseDn}: ${searchErr.message}` });
        }
        let entry = null;
        searchRes.on('searchEntry', (e) => {
          if (entry) return;
          entry = {};
          (e.attributes || []).forEach((attr) => {
            entry[attr.type] = attr.values && attr.values.length ? attr.values[0] : '';
          });
        });
        searchRes.on('error', (err) => {
          clearTimeout(timer);
          finish({ error: `Search failed under ${baseDn}: ${err.message}` });
        });
        searchRes.on('end', () => {
          clearTimeout(timer);
          if (!entry) return finish({ error: `Signed in, but no account named ${sam} was found under ${baseDn}` });
          finish({
            user: {
              username: (entry.sAMAccountName || sam).toLowerCase(),
              email: normalizeEmail(entry.mail || `${sam}@${domain}`),
              name: entry.displayName || entry.givenName || entry.cn || sam,
              isLdap: true,
            },
          });
        });
      });
    });
  });
}

async function ldapAuthenticate(username, password) {
  const result = await ldapCheck(username, password);
  if (result.error) console.warn('LDAP sign-in failed:', result.error);
  return result.user || null;
}

async function localAuthenticate(username, password) {
  const login = String(username).trim().toLowerCase();
  const [rows] = await db.query('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', [login, login]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;
  return { username: user.username, email: user.email, name: user.name, isLdap: false };
}

// Create or refresh the database row for an authenticated identity
async function upsertUser(identity) {
  const email = identity.email.toLowerCase();
  const forcedAdmin = (getSettings().general.adminEmails || []).includes(email);
  const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (existing.length === 0) {
    await db.query(
      'INSERT INTO users (username, email, name, role, is_ldap_user, last_login) VALUES (?, ?, ?, ?, ?, NOW())',
      [identity.username, email, identity.name, forcedAdmin ? 'admin' : 'user', identity.isLdap]
    );
  } else {
    await db.query(
      `UPDATE users SET last_login = NOW(), name = ?${forcedAdmin ? ", role = 'admin'" : ''} WHERE email = ?`,
      [identity.name || existing[0].name, email]
    );
  }
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}

async function authenticate(username, password) {
  const { local, ldap: ldapEnabled } = getSettings().auth;
  const providers = [local && 'local', ldapEnabled && 'ldap'].filter(Boolean);
  for (const provider of providers) {
    const identity = provider === 'local'
      ? await localAuthenticate(username, password)
      : await ldapAuthenticate(username, password);
    if (identity) {
      const user = await upsertUser(identity);
      if (user.status !== 'active') return null;
      return user;
    }
  }
  return null;
}

function publicUser(user) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

function issueToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: `${getSettings().security.sessionHours}h` });
}

// Verifies the bearer token and loads the current user from the database
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [payload.sub]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Account is not active' });
    }
    req.user = { ...publicUser(user), email: user.email.toLowerCase() };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

module.exports = {
  ldapCheck,
  normalizeEmail,
  hashPassword,
  authenticate,
  publicUser,
  issueToken,
  requireAuth,
  requireAdmin,
};
