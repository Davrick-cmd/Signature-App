// Creates the database tables if they do not exist. Safe to run on every start.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

const TRANSIENT = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'];

// A newly created cloud database can take a minute to become reachable
async function connectWithRetry(attempts = 12) {
  for (let i = 1; ; i++) {
    try {
      return await mysql.createConnection({ ...config.db, multipleStatements: true, connectTimeout: 15000 });
    } catch (err) {
      if (i >= attempts || !TRANSIENT.includes(err.code)) throw err;
      console.log(`⏳ Database not reachable yet (${err.code}), retrying in 10s (${i}/${attempts})`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

async function initDatabase() {
  const connection = await connectWithRetry();
  try {
    await connection.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    console.log(`✅ Database "${config.db.database}" is ready`);

    // Optional first admin for fresh installs, e.g. a hosted demo
    const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
    if (email && password && process.env.BOOTSTRAP_ADMIN_RESET === 'true') {
      // Recovery: set this admin's password from the environment, then remove BOOTSTRAP_ADMIN_RESET
      const { hashPassword } = require('../auth');
      const [result] = await connection.query(
        "UPDATE users SET password_hash = ?, role = 'admin', status = 'active' WHERE email = ?",
        [await hashPassword(password), email.toLowerCase()]
      );
      if (result.affectedRows) console.log(`✅ Reset password for admin ${email}`);
    }
    if (email && password) {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      if (admins.length === 0) {
        const { hashPassword } = require('../auth');
        await connection.query(
          `INSERT INTO users (username, email, name, role, password_hash) VALUES (?, ?, ?, 'admin', ?)`,
          [email.split('@')[0].toLowerCase(), email.toLowerCase(), process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator', await hashPassword(password)]
        );
        console.log(`✅ Created admin account ${email}`);
      }
    }
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initDatabase().catch((err) => {
    console.error('❌ Database setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = initDatabase;
