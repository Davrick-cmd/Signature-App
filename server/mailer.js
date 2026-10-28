const nodemailer = require('nodemailer');
const config = require('./config');
const { getSettings } = require('./settings');

// Rebuilt whenever the SMTP settings change in Admin → Settings
let smtpCache = { key: null, transporter: null };

function smtpTransporter(email) {
  const key = JSON.stringify([email.smtpHost, email.smtpPort, email.smtpSecure, email.smtpUser, email.smtpPass]);
  if (smtpCache.key !== key) {
    smtpCache = {
      key,
      transporter: nodemailer.createTransport({
        host: email.smtpHost,
        port: email.smtpPort,
        // true = TLS from the start (port 465); false = STARTTLS upgrade (port 587)
        secure: email.smtpSecure,
        auth: email.smtpUser ? { user: email.smtpUser, pass: email.smtpPass } : undefined,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
      }),
    };
  }
  return smtpCache.transporter;
}

// Brevo sends over HTTPS, so it works on hosts that block SMTP ports (e.g. Render's free plan)
async function sendViaBrevo(email, { to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': email.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: email.fromName || config.appName, email: email.fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Brevo rejected the email (${res.status}): ${body.message || res.statusText}`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Header strings must not contain line breaks
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);

function signLink(documentId, signerEmail) {
  const base = getSettings().general.appUrl || config.appUrl;
  return `${base}/sign/${encodeURIComponent(documentId)}?signer=${encodeURIComponent(signerEmail)}`;
}

// All values passed in `rows` and `paragraphs` are escaped here
function layout({ title, color = '#2563eb', paragraphs = [], rows = [], button }) {
  const rowHtml = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}<br>`)
    .join('');
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: ${color};">${escapeHtml(title)}</h2>
      ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
      ${rowHtml ? `<div style="background:#f8fafc;padding:15px;margin:20px 0;border-radius:6px;border-left:4px solid ${color};">${rowHtml}</div>` : ''}
      ${button ? `<div style="text-align:center;margin:30px 0;"><a href="${escapeHtml(button.href)}" style="background:${color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">${escapeHtml(button.label)}</a></div>` : ''}
      <p>Thank you,<br>${escapeHtml(getSettings().email.fromName || config.appName)}</p>
    </div>`;
}

async function send(to, subject, html) {
  const email = getSettings().email;
  const message = { to, subject: oneLine(subject), html };
  if (email.transport === 'smtp' && email.smtpHost) {
    const fromEmail = email.fromEmail || email.smtpUser;
    await smtpTransporter(email).sendMail({ ...message, from: { name: oneLine(email.fromName || config.appName), address: fromEmail } });
  } else if (email.transport === 'brevo' && email.brevoApiKey && email.fromEmail) {
    await sendViaBrevo(email, message);
  } else {
    console.log(`📧 [email not sent - no email service configured] to=${to} subject="${message.subject}"`);
    return { delivered: false };
  }
  return { delivered: true };
}

// Turns transport errors into advice an admin can act on
function explainEmailError(err) {
  const msg = err?.message || String(err);
  if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|Greeting never received|Connection timeout/i.test(msg)) {
    return `Could not reach the mail server (${msg}). If this app runs on Render's free plan, SMTP ports are blocked there: use Brevo instead, or upgrade the instance.`;
  }
  if (/Invalid login|Username and Password not accepted|535/i.test(msg)) {
    return `The mail server rejected the username or password (${msg}). For Gmail, use an App Password, not your normal password.`;
  }
  return msg;
}

// Failures are logged rather than thrown so email outages never block signing
async function sendSafe(to, subject, html) {
  try {
    await send(to, subject, html);
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message);
  }
}

const templates = {
  test: (to) => [
    to,
    `Test email from ${getSettings().email.fromName || config.appName}`,
    layout({
      title: 'Email is working',
      color: '#16a34a',
      paragraphs: ['This test message confirms that signing requests and notifications can be delivered.'],
      rows: [['Sent at', new Date().toISOString()], ['Delivery method', getSettings().email.transport.toUpperCase()]],
    }),
  ],
  signRequest: (doc, signer, { reminder = false, note } = {}) => [
    signer,
    `${reminder ? 'Reminder: ' : 'Action Required: '}Sign "${doc.name}"`,
    layout({
      title: reminder ? 'Reminder: your signature is required' : 'Your signature is required',
      paragraphs: [
        reminder
          ? 'This document is still waiting for your signature.'
          : 'A document has been shared with you for signature.',
        ...(note ? [`Message from the sender: ${note}`] : []),
      ],
      rows: [['Document', doc.name], ['From', doc.uploaded_by], ['Document ID', doc.id]],
      button: { href: signLink(doc.id, signer), label: 'Review and sign' },
    }),
  ],
  signed: (doc, signer, isCompleted, nextSigner) => [
    doc.uploaded_by,
    `Document ${isCompleted ? 'Completed' : 'Signed'}: ${doc.name}`,
    layout({
      title: isCompleted ? 'Document completed' : 'Document signed',
      color: isCompleted ? '#16a34a' : '#2563eb',
      paragraphs: [
        isCompleted
          ? 'All required signatures have been collected. You can download the final document from your dashboard.'
          : `The document is moving to the next signer${nextSigner ? `: ${nextSigner}` : ''}.`,
      ],
      rows: [['Document', doc.name], ['Signed by', signer], ['Status', isCompleted ? 'Completed' : 'In progress']],
    }),
  ],
  declined: (doc, signer, reason) => [
    doc.uploaded_by,
    `Document Declined: ${doc.name}`,
    layout({
      title: 'Document declined',
      color: '#dc2626',
      paragraphs: ['You can review the document and send a new version if needed.'],
      rows: [['Document', doc.name], ['Declined by', signer], ['Reason', reason], ['Status', 'Cancelled']],
    }),
  ],
  expired: (doc) => [
    doc.uploaded_by,
    `Document Expired: ${doc.name}`,
    layout({
      title: 'Document expired',
      color: '#d97706',
      paragraphs: [`Your document "${doc.name}" has expired and was cancelled automatically.`],
    }),
  ],
};

module.exports = { send, sendSafe, templates, escapeHtml, explainEmailError };
