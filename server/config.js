const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const list = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  isProduction,
  appName: process.env.APP_NAME || 'SignFlow',
  // Public URL of the web app; used for CORS and links in emails
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  port: parseInt(process.env.PORT || '3001', 10),
  trustProxy: process.env.TRUST_PROXY || false,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'signflow',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'signflow',
  },

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // "local", "ldap" or "local,ldap"
  authProviders: list(process.env.AUTH_PROVIDERS || 'local'),
  ldap: {
    url: process.env.LDAP_URL || '',
    domain: (process.env.LDAP_DOMAIN || '').toLowerCase(),
    baseDn: process.env.LDAP_BASE_DN || '',
  },
  // Domain appended to bare usernames (e.g. "jdoe" -> "jdoe@example.com")
  emailDomain: (process.env.EMAIL_DOMAIN || process.env.LDAP_DOMAIN || 'example.com').toLowerCase(),
  // Emails that are always granted the admin role on login
  adminEmails: list(process.env.ADMIN_EMAILS),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || `SignFlow <no-reply@${process.env.EMAIL_DOMAIN || 'example.com'}>`,

  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads')),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || '10', 10) * 1024 * 1024,
  frontendDist: path.resolve(process.env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist')),
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  config.jwtSecret = 'dev-only-insecure-secret-change-me-before-deploying';
  console.warn('⚠️  JWT_SECRET not set - using an insecure development secret');
}

if (config.authProviders.includes('ldap') && !config.ldap.url) {
  throw new Error('AUTH_PROVIDERS includes "ldap" but LDAP_URL is not set');
}

module.exports = config;
