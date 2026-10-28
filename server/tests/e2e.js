// End-to-end security and workflow test against a running SignFlow instance.
// Needs a fresh database with these local accounts (see scripts/create-user.js):
//   admin: $E2E_ADMIN_EMAIL / $E2E_ADMIN_PASSWORD
//   users: alice@example.com, bob@example.com, eve@example.com with password $E2E_PASSWORD
// Run: E2E_BASE=http://localhost:3001 npm run test:e2e
const { PDFDocument } = require('pdf-lib');
const BASE = process.env.E2E_BASE || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const PASSWORD = process.env.E2E_PASSWORD;
if (!ADMIN_PASSWORD || !PASSWORD) {
  console.error('Set E2E_ADMIN_PASSWORD and E2E_PASSWORD');
  process.exit(1);
}
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const api = async (method, url, token, body, isForm) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
};
const login = async (u, p) => (await api('POST', '/api/auth/login', null, { username: u, password: p })).json?.token;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  check('unauthenticated document list is rejected', (await api('GET', '/api/documents')).status === 401);
  check('old open email relay is gone', (await api('POST', '/api/send-email', null, { to: 'x@y.z', subject: 's', html: 'h' })).status === 401);
  check('wrong password rejected', (await api('POST', '/api/auth/login', null, { username: 'alice', password: 'nope' })).status === 401);
  check('LDAP-style injection username rejected', (await api('POST', '/api/auth/login', null, { username: '*)(uid=*', password: 'x' })).status === 401);

  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const alice = await login('alice', PASSWORD);
  const bob = await login('bob@example.com', PASSWORD);
  const eve = await login('eve', PASSWORD);
  check('all users can sign in', admin && alice && bob && eve);

  const pdf = await PDFDocument.create(); pdf.addPage([600, 800]);
  const pdfBytes = await pdf.save();
  const form = new FormData();
  form.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), 'contract.pdf');
  form.append('name', 'Contract <script>alert(1)</script>');
  form.append('signers', JSON.stringify(['bob', 'alice@example.com']));
  form.append('uploaded_by', 'eve@example.com'); // must be ignored
  const up = await api('POST', '/api/upload', alice, form, true);
  check('upload works', up.status === 200, JSON.stringify(up.json));
  const id = up.json.id;
  check('uploader moved to first signer, bare username normalised', JSON.stringify(up.json.signers) === '["alice@example.com","bob@example.com"]');

  const fake = new FormData();
  fake.append('document', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
  check('upload with fake PDF content rejected', (await api('POST', '/api/upload', alice, fake, true)).status === 400);

  const doc = await api('GET', `/api/documents/${id}`, alice);
  check('owner can view; uploaded_by comes from the token', doc.status === 200 && doc.json.uploaded_by === 'alice@example.com');
  check('server file path not exposed', doc.json && !('file_path' in doc.json));

  check('outsider cannot view document', (await api('GET', `/api/documents/${id}`, eve)).status === 404);
  check('outsider cannot fetch file', (await api('GET', `/api/documents/${id}/file`, eve)).status === 404);
  check('outsider cannot sign', (await api('POST', `/api/documents/${id}/sign`, eve, { signatureData: {} })).status === 404);
  check('outsider cannot delete', (await api('DELETE', `/api/documents/${id}`, eve)).status === 404);
  check('outsider cannot list all documents', (await api('GET', '/api/documents?filter=all', eve)).status === 403);
  check('old public /uploads path is gone', !(await api('GET', '/uploads/x.pdf')).text.includes('%PDF'));
  check('signer can fetch file', (await api('GET', `/api/documents/${id}/file`, bob)).text.startsWith('%PDF'));

  check('non-admin cannot list users', (await api('GET', '/api/users', eve)).status === 403);
  check('non-admin cannot grant admin', (await api('PUT', '/api/users/1/role', eve, { role: 'admin' })).status === 403);
  check('admin can list users', (await api('GET', '/api/users', admin)).status === 200);

  const fields = [
    { id: 'f1', type: 'signature', signer: 'alice@example.com', pageNumber: 1, relativeX: 10, relativeY: 80, relativeWidth: 20, relativeHeight: 5 },
    { id: 'f2', type: 'signature', signer: 'bob@example.com', pageNumber: 1, relativeX: 60, relativeY: 80, relativeWidth: 20, relativeHeight: 5 },
  ];
  check('signer cannot change field layout', (await api('POST', `/api/documents/${id}/fields`, bob, { signatureFields: fields })).status === 403);
  const send = await api('POST', `/api/documents/${id}/send`, alice, { signatureFields: fields });
  check('owner sends; owner is first signer', send.status === 200 && send.json.ownerFirst === true, JSON.stringify(send.json));

  check('bob cannot sign before alice', (await api('POST', `/api/documents/${id}/sign`, bob, { signatureData: { signatureFields: [] } })).status === 403);
  const forBobEarly = await api('GET', '/api/documents?filter=for-signing', bob);
  check('not in bob\'s queue yet', forBobEarly.json.length === 0);

  // Alice also tries to stamp bob's field and move her own field
  const s1 = await api('POST', `/api/documents/${id}/sign`, alice, {
    signatureData: { signatureFields: [
      { id: 'f1', signatureDataUrl: PNG, relativeX: 99 },
      { id: 'f2', signatureDataUrl: PNG },
    ] },
  });
  check('alice signs', s1.status === 200 && s1.json.nextSigner === 'bob@example.com', JSON.stringify(s1.json));
  const afterAlice = await api('GET', `/api/documents/${id}`, alice);
  const aliceFields = afterAlice.json.signatures[0].signatureData.signatureFields;
  check('alice could only fill her own field, at the stored position', aliceFields.length === 1 && aliceFields[0].id === 'f1' && aliceFields[0].relativeX === 10);
  check('alice cannot sign twice', (await api('POST', `/api/documents/${id}/sign`, alice, {})).status === 400);
  check('layout locked after first signature', (await api('POST', `/api/documents/${id}/fields`, alice, { signatureFields: fields })).status === 409);
  check('download blocked before completion', (await api('GET', `/api/documents/${id}/download`, alice)).status === 409);

  const forBob = await api('GET', '/api/documents?filter=for-signing', bob);
  check('now in bob\'s queue', forBob.json.length === 1);

  // Two concurrent signs by bob: exactly one should succeed
  const [a, b] = await Promise.all([
    api('POST', `/api/documents/${id}/sign`, bob, { signatureData: { signatureFields: [{ id: 'f2', signatureDataUrl: PNG }] } }),
    api('POST', `/api/documents/${id}/sign`, bob, { signatureData: { signatureFields: [{ id: 'f2', signatureDataUrl: PNG }] } }),
  ]);
  check('concurrent double-sign: exactly one succeeds', [a.status, b.status].sort().join() === '200,400', `${a.status},${b.status}`);
  const final = await api('GET', `/api/documents/${id}`, alice);
  check('document completed with 2 signatures', final.json.status === 'completed' && final.json.signatureCount === 2);

  const dl = await api('GET', `/api/documents/${id}/download`, alice);
  check('owner downloads signed PDF', dl.status === 200 && dl.text.startsWith('%PDF'));
  check('signer cannot download owner\'s final copy', (await api('GET', `/api/documents/${id}/download`, bob)).status === 403);
  check('outsider cannot download', (await api('GET', `/api/documents/${id}/download`, eve)).status === 404);

  const stats = await api('GET', '/api/admin/stats', admin);
  const signerEmails = (stats.json.topSigners || []).map((t) => t.email);
  check('admin stats are real', stats.status === 200 && stats.json.completedDocuments >= 1 && signerEmails.includes('alice@example.com') && signerEmails.includes('bob@example.com'), JSON.stringify(stats.json));
  const logs = await api('GET', '/api/admin/activity-logs', admin);
  check('audit trail recorded', logs.json.some((l) => l.action === 'document.completed'));

  const newEmail = `e2e.user${Date.now()}@example.com`;
  check('non-admin cannot create users', (await api('POST', '/api/users', eve, { email: newEmail, name: 'X', password: 'LongEnough#123' })).status === 403);
  const created = await api('POST', '/api/users', admin, { email: newEmail, name: 'E2E User', password: 'LongEnough#123' });
  check('admin creates a user', created.status === 201, JSON.stringify(created.json));
  check('duplicate user rejected', (await api('POST', '/api/users', admin, { email: newEmail, name: 'E2E User', password: 'LongEnough#123' })).status === 409);
  check('short password rejected', (await api('PUT', `/api/users/${created.json.id}/password`, admin, { password: 'short' })).status === 400);
  check('non-admin cannot reset passwords', (await api('PUT', `/api/users/${created.json.id}/password`, eve, { password: 'Another#Pass123' })).status === 403);
  check('admin resets password', (await api('PUT', `/api/users/${created.json.id}/password`, admin, { password: 'Another#Pass123' })).status === 200);
  check('new user signs in with reset password', !!(await login(newEmail, 'Another#Pass123')));

  check('non-admin cannot change branding', (await api('PUT', '/api/admin/branding', eve, { displayName: 'x' })).status === 403);
  check('branding is public for the login page', (await api('GET', '/api/branding')).status === 200);

  const home = await api('GET', '/');
  check('frontend served from the same server', home.status === 200 && home.text.includes('<div id="root">'));
  check('security headers present', !!home.headers.get('content-security-policy'));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
