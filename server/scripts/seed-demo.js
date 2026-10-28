// Fills a fresh SignFlow instance with demo users and sample documents through the API.
// Usage: SEED_BASE=https://your-app.onrender.com SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
//        DEMO_PASSWORD=... node scripts/seed-demo.js
// All people and companies are fictional.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const signatures = require('./demo-signatures.json');

const BASE = (process.env.SEED_BASE || 'http://localhost:3001').replace(/\/$/, '');
const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, DEMO_PASSWORD } = process.env;
if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || !DEMO_PASSWORD || DEMO_PASSWORD.length < 10) {
  console.error('Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and DEMO_PASSWORD (10+ characters)');
  process.exit(1);
}

const AMINA = 'amina.uwase@northwind.example';
const DANIEL = 'daniel.okello@northwind.example';
const GRACE = 'grace.njeri@partner.example';

async function api(method, url, token, body, isForm) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${method} ${url}: ${res.status} ${json.error || ''}`), { status: res.status });
  return json;
}

const login = async (username, password) => (await api('POST', '/api/auth/login', null, { username, password })).token;

async function makePdf(title, ref, paragraphs) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.1, 0.12, 0.2);
  const grey = rgb(0.4, 0.4, 0.45);
  page.drawText('NORTHWIND FINANCE LTD', { x: 60, y: 780, size: 10, font: bold, color: rgb(0.2, 0.3, 0.7) });
  page.drawText(ref, { x: 430, y: 780, size: 9, font, color: grey });
  page.drawLine({ start: { x: 60, y: 770 }, end: { x: 535, y: 770 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.85) });
  page.drawText(title, { x: 60, y: 730, size: 20, font: bold, color: ink });
  let y = 695;
  for (const paragraph of paragraphs) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (font.widthOfTextAtSize(line + word, 10.5) > 475) {
        page.drawText(line, { x: 60, y, size: 10.5, font, color: ink });
        y -= 16;
        line = '';
      }
      line += `${word} `;
    }
    page.drawText(line, { x: 60, y, size: 10.5, font, color: ink });
    y -= 28;
  }
  ['For Northwind Finance', 'For the Counterparty', 'Witness'].forEach((label, i) => {
    const x = 60 + i * 165;
    page.drawLine({ start: { x, y: 150 }, end: { x: x + 140, y: 150 }, thickness: 0.6, color: ink });
    page.drawText(label, { x, y: 136, size: 9, font, color: grey });
  });
  return pdf.save();
}

async function upload(token, name, signers, bytes) {
  const form = new FormData();
  form.append('document', new Blob([bytes], { type: 'application/pdf' }), `${name}.pdf`);
  form.append('name', name);
  form.append('signers', JSON.stringify(signers));
  return (await api('POST', '/api/upload', token, form, true)).id;
}

// One signature field per signer, on the PDF's signature lines
const fieldsFor = (signers) => signers.map((signer, i) => ({
  id: `f${i + 1}`, type: 'signature', signer, pageNumber: 1,
  x: 0, y: 0, width: 114, height: 46,
  relativeX: 10 + i * 27.7, relativeY: 76.5, relativeWidth: 23, relativeHeight: 5.5,
}));

const sign = (token, id, fieldId, name) =>
  api('POST', `/api/documents/${id}/sign`, token, { signatureData: { signatureFields: [{ id: fieldId, signatureDataUrl: signatures[name] }] } });

const clauses = [
  'This Agreement sets out the terms on which the Supplier will provide managed IT support services to Northwind Finance Ltd ("the Client") for the period 1 November 2026 to 31 October 2027.',
  'The Supplier will maintain a response time of four business hours for priority incidents and will report service levels to the Client monthly. Fees are payable within 30 days of a valid invoice.',
  'Either party may terminate this Agreement with 60 days written notice. Confidential information exchanged under this Agreement remains confidential for three years after termination.',
];

(async () => {
  const admin = await login(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  for (const [email, name] of [[AMINA, 'Amina Uwase'], [DANIEL, 'Daniel Okello'], [GRACE, 'Grace Njeri']]) {
    try {
      await api('POST', '/api/users', admin, { email, name, password: DEMO_PASSWORD });
      console.log(`created ${email}`);
    } catch (err) {
      if (err.status !== 409) throw err;
      console.log(`exists  ${email}`);
    }
  }

  const amina = await login(AMINA, DEMO_PASSWORD);
  const daniel = await login(DANIEL, DEMO_PASSWORD);
  const existing = await api('GET', '/api/documents', amina);
  if (existing.length) {
    console.log('Demo documents already exist, skipping');
    return;
  }

  // In progress: Amina signed, waiting for Daniel
  const s1 = [AMINA, DANIEL, GRACE];
  const vendor = await upload(amina, 'Vendor Services Agreement - Q4', s1, await makePdf('Vendor Services Agreement', 'REF NWF/PRC/2026/118', clauses));
  await api('POST', `/api/documents/${vendor}/send`, amina, { signatureFields: fieldsFor(s1) });
  await sign(amina, vendor, 'f1', 'Amina Uwase');

  // Completed
  const s2 = [AMINA, DANIEL];
  const board = await upload(amina, 'Board Resolution 2026-14', s2, await makePdf('Board Resolution 2026-14', 'REF NWF/BRD/2026/14', clauses.slice(0, 2)));
  await api('POST', `/api/documents/${board}/send`, amina, { signatureFields: fieldsFor(s2) });
  await sign(amina, board, 'f1', 'Amina Uwase');
  await sign(daniel, board, 'f2', 'D. Okello');

  // Prepared, not sent yet
  const s3 = [DANIEL, GRACE];
  const loan = await upload(amina, 'Staff Loan Agreement - D. Okello', s3, await makePdf('Staff Loan Agreement', 'REF NWF/HR/2026/302', clauses.slice(1)));
  await api('POST', `/api/documents/${loan}/fields`, amina, { signatureFields: fieldsFor(s3) });

  await upload(amina, 'NDA - Kigali Data Centre Visit', [GRACE], await makePdf('Non-Disclosure Agreement', 'REF NWF/LGL/2026/077', clauses.slice(2)));
  console.log('Demo documents created');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
