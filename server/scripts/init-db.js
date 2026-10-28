// Creates the database tables if they do not exist. Safe to run on every start.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

async function initDatabase() {
  const connection = await mysql.createConnection({ ...config.db, multipleStatements: true });
  try {
    await connection.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    console.log(`✅ Database "${config.db.database}" is ready`);

    // Optional first admin for fresh installs, e.g. a hosted demo
    const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
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
