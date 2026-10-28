// Creates or updates a local (non-LDAP) user account.
// Usage: node scripts/create-user.js <email> <name> [--admin]
// The password is read from the SIGNFLOW_PASSWORD env var or prompted for.
const readline = require('readline');
const db = require('../db');
const { hashPassword, normalizeEmail } = require('../auth');

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const args = process.argv.slice(2);
  const isAdmin = args.includes('--admin');
  const [emailArg, ...nameParts] = args.filter((a) => a !== '--admin');
  if (!emailArg) {
    console.log('Usage: node scripts/create-user.js <email> <name> [--admin]');
    process.exit(1);
  }

  const email = normalizeEmail(emailArg);
  const name = nameParts.join(' ') || email.split('@')[0];
  const password = process.env.SIGNFLOW_PASSWORD || (await prompt('Password (min 10 characters): '));
  if (!password || password.length < 10) {
    console.error('Password must be at least 10 characters');
    process.exit(1);
  }

  const username = email.split('@')[0];
  await db.query(
    `INSERT INTO users (username, email, name, role, password_hash, is_ldap_user)
     VALUES (?, ?, ?, ?, ?, FALSE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), password_hash = VALUES(password_hash), status = 'active'`,
    [username, email, name, isAdmin ? 'admin' : 'user', await hashPassword(password)]
  );
  console.log(`✅ ${isAdmin ? 'Admin' : 'User'} ${email} saved`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
