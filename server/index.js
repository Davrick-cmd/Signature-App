const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const { PDFDocument } = require('pdf-lib');

const config = require('./config');
const db = require('./db');
const mailer = require('./mailer');
const {
  normalizeEmail,
  hashPassword,
  authenticate,
  publicUser,
  issueToken,
  requireAuth,
  requireAdmin,
} = require('./auth');

const app = express();
const trustProxy = /^\d+$/.test(String(config.trustProxy)) ? Number(config.trustProxy) : config.trustProxy;
app.set('trust proxy', trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ origin: config.appUrl, credentials: true }));

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// Only failed sign-ins count toward this limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts, please try again later.' },
});

app.use(express.json({ limit: '10mb' }));

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_URL_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_IMAGE_CHARS = 2 * 1024 * 1024;

// Older rows stored JSON double-encoded, so parse up to twice
function parseList(value) {
  let v = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v : [];
}

const lower = (v) => String(v || '').trim().toLowerCase();

// File bytes live in the database so the app server keeps no state on disk.
// Installs from before that change still have files in UPLOAD_DIR, read as a fallback.
async function getFile(doc, kind) {
  const [rows] = await db.query('SELECT data FROM document_files WHERE document_id = ? AND kind = ?', [doc.id, kind]);
  if (rows[0]) return rows[0].data;
  if (!doc.file_path) return null;
  const legacy = path.join(config.uploadDir, `${kind === 'signed' ? 'signed_' : ''}${path.basename(doc.file_path)}`);
  return fs.existsSync(legacy) ? fs.promises.readFile(legacy) : null;
}

async function putFile(documentId, kind, data) {
  await db.query(
    'INSERT INTO document_files (document_id, kind, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [documentId, kind, Buffer.from(data)]
  );
}

function hasSigned(signatures, email) {
  return signatures.some((sig) => lower(sig.signerEmail) === lower(email));
}

function getNextSigner(signers, signatures) {
  return signers.find((s) => !hasSigned(signatures, s)) || null;
}

function isUserTurnToSign(signers, signatures, email) {
  const idx = signers.findIndex((s) => lower(s) === lower(email));
  if (idx === -1) return false;
  for (let i = 0; i < idx; i++) {
    if (!hasSigned(signatures, signers[i])) return false;
  }
  return !hasSigned(signatures, email);
}

// If the uploader is one of the signers, they always sign first
function uploaderSignsFirst(signers, uploaderEmail) {
  const idx = signers.findIndex((s) => lower(s) === lower(uploaderEmail));
  if (idx <= 0) return signers;
  const reordered = [...signers];
  reordered.unshift(reordered.splice(idx, 1)[0]);
  return reordered;
}

const isOwner = (user, doc) => lower(doc.uploaded_by) === user.email;
const isSigner = (user, doc) => parseList(doc.signers).some((s) => lower(s) === user.email);
const canView = (user, doc) => user.role === 'admin' || isOwner(user, doc) || isSigner(user, doc);
const canManage = (user, doc) => user.role === 'admin' || isOwner(user, doc);

function isExpired(doc) {
  return !!doc.expires_at && new Date(doc.expires_at) < new Date();
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function serializeDocument(row) {
  const signers = parseList(row.signers);
  const signatures = parseList(row.signature_data);
  return {
    id: String(row.id),
    name: row.name,
    status: row.status,
    uploadDate: formatDate(row.upload_date),
    signers,
    size: formatSize(row.size),
    sizeBytes: Number(row.size) || 0,
    uploaded_by: row.uploaded_by,
    file_url: row.file_path ? `/api/documents/${row.id}/file` : null,
    mime_type: row.mime_type,
    message: row.message,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    signatures,
    signatureCount: signatures.length,
    signatureFields: parseList(row.signature_fields),
    nextSigner: getNextSigner(signers, signatures),
  };
}

async function logAuditEvent(documentId, eventType, actorEmail, req, metadata = {}) {
  try {
    await db.query(
      `INSERT INTO audit_trail_events (document_id, event_type, actor_email, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [documentId, eventType, actorEmail, req?.ip || null, req?.headers['user-agent'] || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Error logging audit event:', err.message);
  }
}

// Loads :id and enforces the given permission check; sets req.doc
function loadDocument(permission) {
  return async (req, res, next) => {
    try {
      const [rows] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
      const doc = rows[0];
      // Respond 404 for documents the user may not see, to avoid revealing they exist
      if (!doc || !canView(req.user, doc)) return res.status(404).json({ error: 'Document not found' });
      if (!permission(req.user, doc)) return res.status(403).json({ error: 'You do not have permission for this action' });
      req.doc = doc;
      next();
    } catch (err) {
      next(err);
    }
  };
}

const idParam = param('id').isInt({ min: 1 }).withMessage('Invalid document ID');

async function generateFinalSignedPDF(doc) {
  const signatures = parseList(doc.signature_data);
  const original = await getFile(doc, 'original');
  if (!original) throw new Error('Original document file not found');

  const pdfDoc = await PDFDocument.load(original);
  const pageCount = pdfDoc.getPageCount();

  for (const sig of signatures) {
    for (const f of sig?.signatureData?.signatureFields || []) {
      if (!f?.signatureDataUrl) continue;
      const pageNumber = Math.min(Math.max(1, f.pageNumber || 1), pageCount);
      const page = pdfDoc.getPage(pageNumber - 1);
      const { width, height } = page.getSize();
      const relW = f.relativeWidth ?? 10;
      const relH = f.relativeHeight ?? 5;
      const bytes = Buffer.from(f.signatureDataUrl.split(',')[1], 'base64');
      let image;
      try {
        image = f.signatureDataUrl.startsWith('data:image/jpeg') ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
      } catch {
        continue;
      }
      page.drawImage(image, {
        x: ((f.relativeX ?? 0) / 100) * width,
        y: height - ((f.relativeY ?? 0) / 100) * height - (relH / 100) * height,
        width: (relW / 100) * width,
        height: (relH / 100) * height,
      });
    }
  }

  const signed = Buffer.from(await pdfDoc.save());
  await putFile(doc.id, 'signed', signed);
  return signed;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({ appName: config.appName, authProviders: config.authProviders, emailDomain: config.emailDomain });
});

app.post('/api/auth/login',
  loginLimiter,
  [
    body('username').isString().trim().isLength({ min: 1, max: 255 }),
    body('password').isString().isLength({ min: 1, max: 1024 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await authenticate(req.body.username, req.body.password);
      if (!user) return res.status(401).json({ error: 'Invalid username or password' });
      await logAuditEvent(null, 'user.login', user.email, req);
      res.json({ token: issueToken(user), user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// Branding is public so the login page can show the customer's logo
async function getBranding() {
  const [rows] = await db.query(
    "SELECT name, text_value, mime_type, updated_at, blob_value IS NOT NULL AS has_blob FROM app_settings WHERE name IN ('display_name', 'logo')"
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  const logo = byName.logo && byName.logo.has_blob ? byName.logo : null;
  return {
    appName: config.appName,
    displayName: byName.display_name?.text_value || config.appName,
    logoUrl: logo ? `/api/branding/logo?v=${new Date(logo.updated_at).getTime()}` : null,
  };
}

app.get('/api/branding', async (req, res, next) => {
  try {
    res.json(await getBranding());
  } catch (err) {
    next(err);
  }
});

app.get('/api/branding/logo', async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT blob_value, mime_type FROM app_settings WHERE name = 'logo'");
    if (!rows[0]?.blob_value) return res.status(404).json({ error: 'No logo set' });
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(rows[0].mime_type).send(rows[0].blob_value);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Everything below requires a signed-in user
// ---------------------------------------------------------------------------

app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => res.json(req.user));

const ALLOWED_MIME = {
  'application/pdf': (b) => b.subarray(0, 4).toString() === '%PDF',
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(Object.assign(new Error('Invalid file type. Only PDF, PNG and JPEG are allowed.'), { status: 400 }));
  },
});

app.post('/api/upload', upload.single('document'), async (req, res, next) => {
  const removeUpload = () => {};
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    if (!ALLOWED_MIME[req.file.mimetype](req.file.buffer)) {
      removeUpload();
      return res.status(400).json({ error: 'File content does not match its type' });
    }

    const { name, signers, expiresAt, message } = req.body;
    let signerList;
    try {
      signerList = typeof signers === 'string' && signers ? JSON.parse(signers) : [];
    } catch {
      signerList = null;
    }
    if (!Array.isArray(signerList) || signerList.length > 25) {
      removeUpload();
      return res.status(400).json({ error: 'Signers must be a JSON array of up to 25 emails' });
    }
    signerList = [...new Set(signerList.map(normalizeEmail).filter(Boolean))];
    const invalid = signerList.filter((s) => !EMAIL_RE.test(s));
    if (invalid.length) {
      removeUpload();
      return res.status(400).json({ error: `Invalid signer email: ${invalid.join(', ')}` });
    }
    signerList = uploaderSignsFirst(signerList, req.user.email);

    let expiresAtDate = null;
    if (expiresAt) {
      expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate) || expiresAtDate <= new Date()) {
        removeUpload();
        return res.status(400).json({ error: 'Expiration date must be a valid date in the future' });
      }
    }

    const docName = String(name || req.file.originalname).slice(0, 255);
    const [result] = await db.query(
      `INSERT INTO documents (name, file_path, mime_type, size, status, signers, upload_date, uploaded_by, expires_at, message)
       VALUES (?, ?, ?, ?, 'pending', ?, CURDATE(), ?, ?, ?)`,
      [
        docName,
        String(req.file.originalname).slice(0, 255),
        req.file.mimetype,
        req.file.size,
        JSON.stringify(signerList),
        req.user.email,
        expiresAtDate,
        message ? String(message).slice(0, 2000) : null,
      ]
    );

    await putFile(result.insertId, 'original', req.file.buffer);

    await logAuditEvent(result.insertId, 'document.uploaded', req.user.email, req, {
      documentName: docName,
      fileSize: req.file.size,
      signersCount: signerList.length,
    });

    res.json({
      message: 'File uploaded and saved successfully',
      id: String(result.insertId),
      signers: signerList,
      expiresAt: expiresAtDate,
      uploaderAssignedAsFirst: signerList[0] === req.user.email,
    });
  } catch (err) {
    removeUpload();
    next(err);
  }
});

app.get('/api/documents', async (req, res, next) => {
  try {
    const filter = req.query.filter || 'my-documents';
    let rows;
    if (filter === 'all') {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      [rows] = await db.query('SELECT * FROM documents ORDER BY created_at DESC');
    } else if (filter === 'for-signing') {
      [rows] = await db.query(
        "SELECT * FROM documents WHERE status NOT IN ('completed', 'cancelled', 'declined') ORDER BY created_at DESC"
      );
      rows = rows.filter((row) => {
        const signers = parseList(row.signers);
        return !isExpired(row) && isUserTurnToSign(signers, parseList(row.signature_data), req.user.email);
      });
    } else {
      [rows] = await db.query('SELECT * FROM documents WHERE LOWER(uploaded_by) = ? ORDER BY created_at DESC', [req.user.email]);
    }
    res.json(rows.map(serializeDocument));
  } catch (err) {
    next(err);
  }
});

app.get('/api/documents/:id', [idParam], validate, loadDocument(canView), (req, res) => {
  res.json(serializeDocument(req.doc));
});

app.get('/api/documents/:id/file', [idParam], validate, loadDocument(canView), async (req, res, next) => {
  try {
    const data = await getFile(req.doc, 'original');
    if (!data) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(req.doc.mime_type || 'application/pdf').send(data);
  } catch (err) {
    next(err);
  }
});

app.get('/api/documents/:id/download', [idParam], validate, loadDocument(canManage), async (req, res, next) => {
  try {
    const doc = req.doc;
    if (doc.status !== 'completed') {
      return res.status(409).json({ error: 'Document not completed. Download is available after all signatures.' });
    }
    let data = await getFile(doc, 'signed');
    if (!data) {
      try {
        data = await generateFinalSignedPDF(doc);
      } catch (err) {
        console.error('Error generating final PDF for download:', err.message);
        data = await getFile(doc, 'original');
      }
    }
    if (!data) return res.status(404).json({ error: 'File not found' });
    await logAuditEvent(doc.id, 'document.downloaded', req.user.email, req, { documentName: doc.name });
    const fileName = doc.name.toLowerCase().endsWith('.pdf') ? doc.name : `${doc.name}.pdf`;
    res.attachment(fileName).type('application/pdf').send(data);
  } catch (err) {
    next(err);
  }
});

app.post('/api/documents/:id/generate-final-pdf', [idParam], validate, loadDocument(canManage), async (req, res, next) => {
  try {
    const signatures = parseList(req.doc.signature_data);
    if (signatures.length === 0) return res.status(400).json({ error: 'No signatures found for this document' });
    await generateFinalSignedPDF(req.doc);
    res.json({
      success: true,
      message: 'Final signed document generated successfully',
      totalSignatures: signatures.length,
      documentName: req.doc.name,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/documents/:id/fields', [idParam], validate, loadDocument(canView), (req, res) => {
  res.json({ signatureFields: parseList(req.doc.signature_fields) });
});

// Field layout is locked once anyone has signed, so signed positions cannot move
async function saveFields(doc, fields) {
  if (parseList(doc.signature_data).length > 0 || ['completed', 'cancelled', 'declined'].includes(doc.status)) {
    return false;
  }
  const clean = fields.slice(0, 200).map((f) => ({
    id: String(f.id ?? ''),
    type: String(f.type || 'signature'),
    signer: normalizeEmail(f.signer),
    pageNumber: Number(f.pageNumber) || 1,
    x: Number(f.x) || 0,
    y: Number(f.y) || 0,
    width: Number(f.width) || 0,
    height: Number(f.height) || 0,
    relativeX: Number(f.relativeX) || 0,
    relativeY: Number(f.relativeY) || 0,
    relativeWidth: Number(f.relativeWidth) || 10,
    relativeHeight: Number(f.relativeHeight) || 5,
    signerColor: f.signerColor ? String(f.signerColor).slice(0, 20) : undefined,
  }));
  await db.query('UPDATE documents SET signature_fields = ? WHERE id = ?', [JSON.stringify(clean), doc.id]);
  return true;
}

app.post('/api/documents/:id/fields',
  [idParam, body('signatureFields').isArray()],
  validate,
  loadDocument(canManage),
  async (req, res, next) => {
    try {
      if (!(await saveFields(req.doc, req.body?.signatureFields))) {
        return res.status(409).json({ error: 'Fields cannot be changed after signing has started' });
      }
      res.json({ success: true, message: 'Signature fields saved successfully' });
    } catch (err) {
      next(err);
    }
  }
);

app.delete('/api/documents/:id', [idParam], validate, loadDocument(canManage), async (req, res, next) => {
  try {
    // document_files rows are removed by ON DELETE CASCADE
    await db.query('DELETE FROM documents WHERE id = ?', [req.doc.id]);
    await logAuditEvent(null, 'document.deleted', req.user.email, req, { documentId: req.doc.id, documentName: req.doc.name });
    res.json({ success: true, message: 'Document deleted successfully', deletedId: String(req.doc.id) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/documents/:id/send',
  [idParam, body('signatureFields').optional().isArray()],
  validate,
  loadDocument(canManage),
  async (req, res, next) => {
    try {
      const doc = req.doc;
      if (['completed', 'cancelled', 'declined'].includes(doc.status) || isExpired(doc)) {
        return res.status(409).json({ error: `Document is ${isExpired(doc) ? 'expired' : doc.status}` });
      }
      if (req.body?.signatureFields) await saveFields(doc, req.body?.signatureFields);

      let signers = parseList(doc.signers);
      const fields = req.body?.signatureFields || parseList(doc.signature_fields);
      const ownerHasFields = fields.some((f) => normalizeEmail(f?.signer) === lower(doc.uploaded_by));
      if (ownerHasFields && !signers.some((s) => lower(s) === lower(doc.uploaded_by))) {
        signers = [lower(doc.uploaded_by), ...signers];
      }
      signers = uploaderSignsFirst(signers, doc.uploaded_by);
      await db.query("UPDATE documents SET signers = ?, status = 'sent' WHERE id = ?", [JSON.stringify(signers), doc.id]);

      if (signers.length === 0) {
        return res.json({ success: true, message: 'Document prepared but no signers specified', totalSigners: 0 });
      }

      const firstSigner = getNextSigner(signers, parseList(doc.signature_data));
      if (lower(firstSigner) === lower(doc.uploaded_by)) {
        return res.json({
          success: true,
          message: 'Sender is the first signer. Prompt local signing instead of emailing.',
          ownerFirst: true,
          firstSigner,
          totalSigners: signers.length,
        });
      }

      if (firstSigner) await mailer.send(...mailer.templates.signRequest(doc, firstSigner, { note: doc.message }));
      await logAuditEvent(doc.id, 'document.sent', req.user.email, req, { firstSigner, totalSigners: signers.length });
      res.json({ success: true, message: `Document sent to ${firstSigner} for signature`, firstSigner, totalSigners: signers.length });
    } catch (err) {
      next(err);
    }
  }
);

// Sends a signing request to the document's next signer, optionally with a note
async function notifyNextSigner(req, res, next, { reminder }) {
  try {
    const doc = req.doc;
    const signers = parseList(doc.signers);
    const nextSigner = getNextSigner(signers, parseList(doc.signature_data));
    if (!nextSigner || ['completed', 'cancelled', 'declined'].includes(doc.status)) {
      return res.status(409).json({ error: 'There is no pending signer for this document' });
    }
    const note = req.body?.message ? String(req.body.message).slice(0, 2000) : doc.message;
    await mailer.send(...mailer.templates.signRequest(doc, nextSigner, { reminder, note }));
    await logAuditEvent(doc.id, reminder ? 'document.reminded' : 'document.shared', req.user.email, req, { to: nextSigner });
    res.json({ success: true, message: `${reminder ? 'Reminder' : 'Request'} sent to ${nextSigner}.`, to: nextSigner });
  } catch (err) {
    next(err);
  }
}

app.post('/api/documents/:id/remind', strictLimiter, [idParam], validate, loadDocument(canManage),
  (req, res, next) => notifyNextSigner(req, res, next, { reminder: true }));

// Replaces the old open /api/send-email relay: only emails the document's own next signer
app.post('/api/documents/:id/share', strictLimiter,
  [idParam, body('message').optional().isString().isLength({ max: 2000 })],
  validate,
  loadDocument(canManage),
  (req, res, next) => notifyNextSigner(req, res, next, { reminder: false }));

app.post('/api/documents/:id/decline',
  strictLimiter,
  [idParam, body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validate,
  loadDocument(isSigner),
  async (req, res, next) => {
    try {
      const doc = req.doc;
      if (['completed', 'cancelled', 'declined'].includes(doc.status)) {
        return res.status(400).json({ error: `Document is already ${doc.status}` });
      }
      if (isExpired(doc)) return res.status(400).json({ error: 'Document has expired' });
      if (hasSigned(parseList(doc.signature_data), req.user.email)) {
        return res.status(400).json({ error: 'You have already signed this document' });
      }

      const reason = req.body?.reason || null;
      await db.query("UPDATE documents SET status = 'cancelled' WHERE id = ?", [doc.id]);
      await logAuditEvent(doc.id, 'document.declined', req.user.email, req, { reason });
      await mailer.sendSafe(...mailer.templates.declined(doc, req.user.email, reason));
      res.json({ success: true, message: 'Document declined successfully', declinedBy: req.user.email, reason });
    } catch (err) {
      next(err);
    }
  }
);

// Builds the signature record from the server's own field layout; the client
// only supplies images for fields assigned to the signer
function buildSignedFields(doc, signerEmail, clientFields) {
  const storedFields = parseList(doc.signature_fields);
  const byId = new Map(storedFields.map((f) => [String(f.id), f]));
  const result = [];
  for (const f of Array.isArray(clientFields) ? clientFields : []) {
    const dataUrl = f?.signatureDataUrl;
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_SIGNATURE_IMAGE_CHARS || !DATA_URL_RE.test(dataUrl)) continue;
    const base = storedFields.length ? byId.get(String(f.id)) : f;
    if (!base) continue;
    const owner = normalizeEmail(base.signer);
    if (owner && owner !== signerEmail) continue;
    result.push({
      id: String(base.id ?? ''),
      type: base.type,
      pageNumber: Number(base.pageNumber) || 1,
      relativeX: Number(base.relativeX) || 0,
      relativeY: Number(base.relativeY) || 0,
      relativeWidth: Number(base.relativeWidth) || 10,
      relativeHeight: Number(base.relativeHeight) || 5,
      signer: signerEmail,
      signatureDataUrl: dataUrl,
    });
  }
  return result;
}

app.post('/api/documents/:id/sign',
  strictLimiter,
  [idParam, body('signatureData').optional().isObject()],
  validate,
  async (req, res, next) => {
    const signerEmail = req.user.email;
    const conn = await db.getConnection();
    let doc, signers, updatedSignatures, isCompleted;
    try {
      await conn.beginTransaction();
      // Row lock prevents two signers overwriting each other's signature
      const [rows] = await conn.query('SELECT * FROM documents WHERE id = ? FOR UPDATE', [req.params.id]);
      doc = rows[0];
      if (!doc || !canView(req.user, doc)) {
        await conn.rollback();
        return res.status(404).json({ error: 'Document not found' });
      }
      if (['completed', 'cancelled', 'declined'].includes(doc.status)) {
        await conn.rollback();
        return res.status(400).json({ error: `Document is ${doc.status}` });
      }
      if (isExpired(doc)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Document has expired and cannot be signed' });
      }

      signers = parseList(doc.signers);
      const existing = parseList(doc.signature_data);
      // A document with no listed signers is a self-sign by its uploader
      const required = signers.length ? signers : [lower(doc.uploaded_by)];

      if (hasSigned(existing, signerEmail)) {
        await conn.rollback();
        return res.status(400).json({ error: 'You have already signed this document' });
      }
      if (!isUserTurnToSign(required, existing, signerEmail)) {
        await conn.rollback();
        const listed = required.some((s) => lower(s) === signerEmail);
        return res.status(403).json({
          error: listed ? 'Please wait for previous signers to complete their signatures first' : 'You are not a signer on this document',
          nextSigner: getNextSigner(required, existing),
        });
      }

      const signedFields = buildSignedFields(doc, signerEmail, req.body?.signatureData?.signatureFields);
      updatedSignatures = [
        ...existing,
        {
          signerEmail,
          signerName: req.user.name,
          signedAt: new Date().toISOString(),
          signPosition: required.findIndex((s) => lower(s) === signerEmail),
          ipAddress: req.ip,
          signatureData: { signatureFields: signedFields },
        },
      ];
      isCompleted = required.every((s) => hasSigned(updatedSignatures, s));

      await conn.query(
        `UPDATE documents SET status = ?, signature_data = ?, completed_at = ${isCompleted ? 'NOW()' : 'NULL'} WHERE id = ?`,
        [isCompleted ? 'completed' : 'in-progress', JSON.stringify(updatedSignatures), doc.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      return next(err);
    } finally {
      conn.release();
    }

    try {
      doc.signature_data = JSON.stringify(updatedSignatures);
      await logAuditEvent(doc.id, 'document.signed', signerEmail, req, { totalSignatures: updatedSignatures.length, isCompleted });
      const nextSigner = getNextSigner(signers, updatedSignatures);

      if (isCompleted) {
        await generateFinalSignedPDF(doc).catch((e) => console.error('Error auto-generating final PDF:', e.message));
        await logAuditEvent(doc.id, 'document.completed', signerEmail, req, { totalSignatures: updatedSignatures.length });
      }
      if (lower(doc.uploaded_by) !== signerEmail) {
        await mailer.sendSafe(...mailer.templates.signed(doc, signerEmail, isCompleted, nextSigner));
      }
      if (!isCompleted && nextSigner) {
        await mailer.sendSafe(...mailer.templates.signRequest(doc, nextSigner));
      }

      res.json({
        success: true,
        message: `Document ${isCompleted ? 'signed and completed' : 'signed'} successfully`,
        signedBy: signerEmail,
        signedAt: new Date().toISOString(),
        isCompleted,
        totalSignatures: updatedSignatures.length,
        requiredSignatures: signers.length || 1,
        nextSigner,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

app.get('/api/users', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, name, role, status, last_login FROM users ORDER BY username');
    res.json(rows.map((u) => ({ ...u, id: String(u.id) })));
  } catch (err) {
    next(err);
  }
});

app.post('/api/users',
  requireAdmin,
  [
    body('email').isEmail(),
    body('name').isString().trim().isLength({ min: 1, max: 255 }),
    body('password').isString().isLength({ min: 10, max: 1024 }).withMessage('Password must be at least 10 characters'),
    body('role').optional().isIn(['user', 'admin']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, email.split('@')[0]]);
      if (existing.length) return res.status(409).json({ error: 'A user with this email or username already exists' });
      const [result] = await db.query(
        'INSERT INTO users (username, email, name, role, password_hash, is_ldap_user) VALUES (?, ?, ?, ?, ?, FALSE)',
        [email.split('@')[0], email, req.body.name, req.body.role || 'user', await hashPassword(req.body.password)]
      );
      await logAuditEvent(null, 'user.created', req.user.email, req, { email, role: req.body.role || 'user' });
      res.status(201).json({ id: String(result.insertId), email, name: req.body.name, role: req.body.role || 'user' });
    } catch (err) {
      next(err);
    }
  }
);

app.put('/api/users/:id/role',
  requireAdmin,
  [param('id').isInt(), body('role').isIn(['user', 'admin'])],
  validate,
  async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
      await db.query('UPDATE users SET role = ? WHERE id = ?', [req.body.role, req.params.id]);
      await logAuditEvent(null, 'user.role_changed', req.user.email, req, { userId: req.params.id, role: req.body.role });
      res.json({ success: true, message: 'User role updated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

app.delete('/api/users/:id', requireAdmin, [param('id').isInt()], validate, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAuditEvent(null, 'user.deleted', req.user.email, req, { userId: req.params.id });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg'].includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Logo must be a PNG or JPEG image'), { status: 400 }));
  },
});

app.put('/api/admin/branding', requireAdmin, logoUpload.single('logo'), async (req, res, next) => {
  try {
    if (req.file) {
      if (!ALLOWED_MIME[req.file.mimetype](req.file.buffer)) {
        return res.status(400).json({ error: 'File content does not match its type' });
      }
      await db.query(
        `INSERT INTO app_settings (name, blob_value, mime_type) VALUES ('logo', ?, ?)
         ON DUPLICATE KEY UPDATE blob_value = VALUES(blob_value), mime_type = VALUES(mime_type), updated_at = NOW()`,
        [req.file.buffer, req.file.mimetype]
      );
    }
    if (typeof req.body?.displayName === 'string') {
      const displayName = req.body.displayName.trim().slice(0, 80);
      await db.query(
        `INSERT INTO app_settings (name, text_value) VALUES ('display_name', ?)
         ON DUPLICATE KEY UPDATE text_value = VALUES(text_value)`,
        [displayName || null]
      );
    }
    await logAuditEvent(null, 'branding.updated', req.user.email, req, { logo: !!req.file, displayName: req.body?.displayName });
    res.json(await getBranding());
  } catch (err) {
    next(err);
  }
});

app.delete('/api/admin/branding/logo', requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM app_settings WHERE name = 'logo'");
    await logAuditEvent(null, 'branding.logo_removed', req.user.email, req);
    res.json(await getBranding());
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res, next) => {
  try {
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalDocuments }]] = await db.query('SELECT COUNT(*) AS totalDocuments FROM documents');
    const [[{ documentsThisMonth }]] = await db.query(
      "SELECT COUNT(*) AS documentsThisMonth FROM documents WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"
    );
    const [statusCounts] = await db.query('SELECT status, COUNT(*) AS count FROM documents GROUP BY status');
    const [[{ avgHours }]] = await db.query(
      'SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, completed_at)) / 60 AS avgHours FROM documents WHERE completed_at IS NOT NULL'
    );
    const [sigRows] = await db.query('SELECT signature_data FROM documents WHERE signature_data IS NOT NULL');

    const counts = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.count)]));
    const signerCounts = {};
    for (const row of sigRows) {
      for (const sig of parseList(row.signature_data)) {
        const email = lower(sig.signerEmail);
        if (email) signerCounts[email] = (signerCounts[email] || 0) + 1;
      }
    }

    res.json({
      totalUsers: Number(totalUsers),
      totalDocuments: Number(totalDocuments),
      documentsThisMonth: Number(documentsThisMonth),
      completedDocuments: counts.completed || 0,
      pendingDocuments: (counts.pending || 0) + (counts.sent || 0),
      inProgressDocuments: counts['in-progress'] || 0,
      // Days from upload to final signature
      averageCompletionTime: avgHours ? Math.round((avgHours / 24) * 10) / 10 : 0,
      topSigners: Object.entries(signerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([email, count]) => ({ email, count })),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/activity-logs', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, d.name AS document_name FROM audit_trail_events e
       LEFT JOIN documents d ON d.id = e.document_id
       ORDER BY e.timestamp DESC LIMIT 100`
    );
    res.json(rows.map((r) => ({
      id: String(r.id),
      userId: r.actor_email,
      userName: r.actor_email,
      action: r.event_type,
      documentId: r.document_id ? String(r.document_id) : undefined,
      documentName: r.document_name || undefined,
      timestamp: r.timestamp,
      ipAddress: r.ip_address,
      details: typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata || {}),
    })));
  } catch (err) {
    next(err);
  }
});

app.get('/api/documents/:id/audit', [idParam], validate, loadDocument(canManage), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT event_type, actor_email, ip_address, metadata, timestamp FROM audit_trail_events WHERE document_id = ? ORDER BY timestamp',
      [req.doc.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Frontend (single-server deployments) and error handling
// ---------------------------------------------------------------------------

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

if (fs.existsSync(path.join(config.frontendDist, 'index.html'))) {
  app.use(express.static(config.frontendDist, { index: false }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `File size exceeds ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB limit.`
      : err.message;
    return res.status(400).json({ error: message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

// ---------------------------------------------------------------------------
// Background job: cancel expired documents
// ---------------------------------------------------------------------------

async function cancelExpiredDocuments() {
  try {
    const [expired] = await db.query(
      `SELECT * FROM documents WHERE status IN ('pending', 'in-progress', 'sent')
       AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    for (const doc of expired) {
      await db.query("UPDATE documents SET status = 'cancelled' WHERE id = ?", [doc.id]);
      await logAuditEvent(doc.id, 'document.expired', 'system', null, { documentName: doc.name });
      await mailer.sendSafe(...mailer.templates.expired(doc));
    }
    if (expired.length) console.log(`⏰ Cancelled ${expired.length} expired document(s)`);
  } catch (err) {
    console.error('Error cancelling expired documents:', err.message);
  }
}

if (require.main === module) {
  const timer = setInterval(cancelExpiredDocuments, 60 * 60 * 1000);
  cancelExpiredDocuments();
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      clearInterval(timer);
      process.exit(0);
    });
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 ${config.appName} server running on port ${config.port}`);
  });
}

module.exports = app;
