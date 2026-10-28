const nodemailer = require('nodemailer');
const config = require('./config');

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

if (!transporter) {
  console.warn('⚠️  SMTP_HOST not set - emails will be printed to the console instead of sent');
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
  return `${config.appUrl}/sign/${encodeURIComponent(documentId)}?signer=${encodeURIComponent(signerEmail)}`;
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
      <p>Thank you,<br>${escapeHtml(config.appName)}</p>
    </div>`;
}

async function send(to, subject, html) {
  const message = { from: config.mailFrom, to, subject: oneLine(subject), html };
  if (!transporter) {
    console.log(`📧 [email not sent - SMTP disabled] to=${to} subject="${message.subject}"`);
    return;
  }
  await transporter.sendMail(message);
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

module.exports = { send, sendSafe, templates, escapeHtml };
