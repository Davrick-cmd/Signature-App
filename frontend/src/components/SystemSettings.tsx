import React, { useEffect, useState } from 'react';
import { Mail, KeyRound, Globe, ShieldCheck, Send, PlugZap, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../config/api';
import { getCurrentUser } from '../services/authService';

interface Settings {
  general: { appUrl: string; emailDomain: string; adminEmails: string[] };
  email: {
    transport: 'none' | 'smtp' | 'brevo';
    smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string; smtpPassSet?: boolean;
    brevoApiKey: string; brevoApiKeySet?: boolean; fromName: string; fromEmail: string;
  };
  auth: { local: boolean; ldap: boolean; ldapUrl: string; ldapDomain: string; ldapBaseDn: string; ldapVerifyTls: boolean };
  security: { sessionHours: number; minPasswordLength: number };
}

type Section = keyof Settings;
type Status = { ok: boolean; text: string } | null;

const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean; hint: string }> = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    hint: 'Use your Gmail address as the username and a 16-character App Password (Google Account → Security → 2-Step Verification → App passwords). Your normal Gmail password will not work.',
  },
  office365: {
    label: 'Microsoft 365 / Outlook',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    hint: 'Use the full mailbox address and its password. SMTP AUTH must be enabled for the mailbox in the Microsoft 365 admin centre.',
  },
  custom: { label: 'Other mail server', host: '', port: 587, secure: false, hint: 'Ask your IT team for the SMTP host, port and credentials.' },
};

const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const label = 'block text-sm font-medium text-gray-700 mb-1';
const hintCls = 'text-xs text-gray-500 mt-1';

const Toggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({ id, checked, onChange, label: text, description }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-900">{text}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

const StatusLine: React.FC<{ status: Status }> = ({ status }) =>
  status ? (
    <div className={`flex items-start gap-2 text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
      {status.ok ? <CheckCircle className="w-4 h-4 mt-0.5 flex-none" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-none" />}
      <span>{status.text}</span>
    </div>
  ) : null;

const Card: React.FC<{ icon: React.ElementType; title: string; description: string; children: React.ReactNode }> = ({ icon: Icon, title, description, children }) => (
  <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div className="flex items-start gap-3 mb-6">
      <span className="w-10 h-10 flex-none rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Icon className="w-5 h-5" /></span>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
    {children}
  </section>
);

const SystemSettings: React.FC = () => {
  const [data, setData] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Section | null>(null);
  const [status, setStatus] = useState<Partial<Record<Section | 'testEmail' | 'testLdap', Status>>>({});
  const [preset, setPreset] = useState('custom');
  const [testTo, setTestTo] = useState(getCurrentUser()?.email || '');
  const [ldapTest, setLdapTest] = useState({ username: '', password: '' });
  const [testing, setTesting] = useState<'email' | 'ldap' | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/settings')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load settings');
        setData(body);
        const match = Object.entries(SMTP_PRESETS).find(([, p]) => p.host && p.host === body.email.smtpHost);
        setPreset(match ? match[0] : 'custom');
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading settings…</p>;

  const update = <S extends Section>(section: S, values: Partial<Settings[S]>) =>
    setData((d) => (d ? { ...d, [section]: { ...d[section], ...values } } : d));

  const setMsg = (key: keyof typeof status, value: Status) => setStatus((s) => ({ ...s, [key]: value }));

  const save = async (section: Section) => {
    setSaving(section);
    setMsg(section, null);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { [section]: data[section] } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save');
      setData(body);
      setMsg(section, { ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg(section, { ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(null);
    }
  };

  const runTest = async (kind: 'email' | 'ldap') => {
    setTesting(kind);
    const key = kind === 'email' ? 'testEmail' : 'testLdap';
    setMsg(key, null);
    try {
      // Save first so the test uses what is on screen
      await save(kind === 'email' ? 'email' : 'auth');
      const res = await apiFetch(`/api/admin/settings/test-${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'email' ? { to: testTo } : ldapTest),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Test failed');
      setMsg(key, { ok: true, text: body.message });
    } catch (err) {
      setMsg(key, { ok: false, text: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(null);
    }
  };

  const applyPreset = (name: string) => {
    setPreset(name);
    const p = SMTP_PRESETS[name];
    if (p.host) update('email', { smtpHost: p.host, smtpPort: p.port, smtpSecure: p.secure });
  };

  const SaveButton: React.FC<{ section: Section }> = ({ section }) => (
    <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
      <StatusLine status={status[section] ?? null} />
      <button
        type="button"
        onClick={() => save(section)}
        disabled={saving === section}
        className="ml-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium"
      >
        {saving === section ? 'Saving…' : 'Save'}
      </button>
    </div>
  );

  const { email, auth, general, security } = data;

  return (
    <div className="space-y-8">
      {/* Email */}
      <Card icon={Mail} title="Email delivery" description="Used for signing requests, reminders and completion notices.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6" role="radiogroup" aria-label="Delivery method">
          {([
            ['none', 'Off', 'Emails are only written to the server log'],
            ['smtp', 'SMTP', 'Gmail, Microsoft 365 or your own mail server'],
            ['brevo', 'Brevo API', 'Works on hosts that block SMTP, such as Render’s free plan'],
          ] as const).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={email.transport === value}
              onClick={() => update('email', { transport: value })}
              className={`text-left p-4 rounded-lg border transition-colors ${email.transport === value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <span className="block text-sm font-semibold text-gray-900">{title}</span>
              <span className="block text-xs text-gray-500 mt-1">{desc}</span>
            </button>
          ))}
        </div>

        {email.transport === 'smtp' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="smtp-preset" className={label}>Provider</label>
              <select id="smtp-preset" className={input} value={preset} onChange={(e) => applyPreset(e.target.value)}>
                {Object.entries(SMTP_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <p className={hintCls}>{SMTP_PRESETS[preset].hint}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="smtp-host" className={label}>SMTP host</label>
                <input id="smtp-host" className={input} value={email.smtpHost} onChange={(e) => update('email', { smtpHost: e.target.value })} placeholder="smtp.example.com" />
              </div>
              <div>
                <label htmlFor="smtp-port" className={label}>Port</label>
                <input id="smtp-port" type="number" className={input} value={email.smtpPort} onChange={(e) => update('email', { smtpPort: Number(e.target.value) })} />
              </div>
            </div>
            <Toggle id="smtp-secure" checked={email.smtpSecure} onChange={(v) => update('email', { smtpSecure: v })} label="Use TLS from the start" description="On for port 465. Off for port 587, which upgrades with STARTTLS." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="smtp-user" className={label}>Username</label>
                <input id="smtp-user" className={input} autoComplete="off" value={email.smtpUser} onChange={(e) => update('email', { smtpUser: e.target.value })} placeholder="you@gmail.com" />
              </div>
              <div>
                <label htmlFor="smtp-pass" className={label}>Password {preset === 'gmail' && '(App Password)'}</label>
                <input id="smtp-pass" type="password" className={input} autoComplete="new-password" value={email.smtpPass} onChange={(e) => update('email', { smtpPass: e.target.value })} placeholder={email.smtpPassSet ? '•••••••• saved; type to replace' : ''} />
              </div>
            </div>
          </div>
        )}

        {email.transport === 'brevo' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Create a free account at brevo.com (300 emails a day), verify the sender address under <em>Senders &amp; IP</em>, then create an API key under <em>SMTP &amp; API → API keys</em>. A Gmail address can be the verified sender.
            </p>
            <div>
              <label htmlFor="brevo-key" className={label}>Brevo API key</label>
              <input id="brevo-key" type="password" className={input} autoComplete="new-password" value={email.brevoApiKey} onChange={(e) => update('email', { brevoApiKey: e.target.value })} placeholder={email.brevoApiKeySet ? '•••••••• saved; type to replace' : 'xkeysib-…'} />
            </div>
          </div>
        )}

        {email.transport !== 'none' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label htmlFor="from-name" className={label}>Sender name</label>
              <input id="from-name" className={input} value={email.fromName} onChange={(e) => update('email', { fromName: e.target.value })} placeholder="Britam Sign" />
            </div>
            <div>
              <label htmlFor="from-email" className={label}>Sender email</label>
              <input id="from-email" type="email" className={input} value={email.fromEmail} onChange={(e) => update('email', { fromEmail: e.target.value })} placeholder="you@gmail.com" />
              <p className={hintCls}>Gmail only sends as the signed-in address; Brevo only as a verified sender.</p>
            </div>
          </div>
        )}

        <SaveButton section="email" />

        {email.transport !== 'none' && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            <label htmlFor="test-to" className="block text-sm font-medium text-gray-900">Send a test email</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input id="test-to" type="email" className={input} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="name@example.com" />
              <button
                type="button"
                onClick={() => runTest('email')}
                disabled={!testTo || testing === 'email'}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                {testing === 'email' ? 'Sending…' : 'Save & send test'}
              </button>
            </div>
            <StatusLine status={status.testEmail ?? null} />
          </div>
        )}
      </Card>

      {/* Sign-in */}
      <Card icon={KeyRound} title="Sign-in methods" description="Who can sign in, and how.">
        <div className="space-y-4">
          <Toggle id="auth-local" checked={auth.local} onChange={(v) => update('auth', { local: v })} label="Local accounts" description="Accounts created by an admin, with passwords stored (hashed) by this app. Used by the Admin tab." />
          <Toggle id="auth-ldap" checked={auth.ldap} onChange={(v) => update('auth', { ldap: v })} label="Active Directory / LDAP" description="People sign in with their normal Windows username and password." />
        </div>
        {!auth.local && (
          <p className="mt-4 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            With local accounts off, admins must sign in with an Active Directory account listed under General → Admin emails. Test LDAP before saving.
          </p>
        )}
        {auth.ldap && (
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ldap-url" className={label}>Server URL</label>
                <input id="ldap-url" className={input} value={auth.ldapUrl} onChange={(e) => update('auth', { ldapUrl: e.target.value })} placeholder="ldaps://dc01.company.local" />
                <p className={hintCls}>Use ldaps:// (port 636) so passwords are encrypted.</p>
              </div>
              <div>
                <label htmlFor="ldap-domain" className={label}>Domain</label>
                <input id="ldap-domain" className={input} value={auth.ldapDomain} onChange={(e) => update('auth', { ldapDomain: e.target.value })} placeholder="company.local" />
                <p className={hintCls}>Users sign in as username, sent to the server as username@domain.</p>
              </div>
            </div>
            <div>
              <label htmlFor="ldap-basedn" className={label}>Search base (optional)</label>
              <input id="ldap-basedn" className={input} value={auth.ldapBaseDn} onChange={(e) => update('auth', { ldapBaseDn: e.target.value })} placeholder="OU=Staff,DC=company,DC=local" />
              <p className={hintCls}>Leave empty to search the whole domain.</p>
            </div>
            <Toggle id="ldap-tls" checked={auth.ldapVerifyTls} onChange={(v) => update('auth', { ldapVerifyTls: v })} label="Verify the server's certificate" description="Turn off only for a test server with a self-signed certificate." />
          </div>
        )}
        <SaveButton section="auth" />
        {auth.ldap && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            <p className="text-sm font-medium text-gray-900">Test an Active Directory sign-in</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
              <input aria-label="Test username" className={input} autoComplete="off" value={ldapTest.username} onChange={(e) => setLdapTest((t) => ({ ...t, username: e.target.value }))} placeholder="username" />
              <input aria-label="Test password" type="password" className={input} autoComplete="new-password" value={ldapTest.password} onChange={(e) => setLdapTest((t) => ({ ...t, password: e.target.value }))} placeholder="password" />
              <button
                type="button"
                onClick={() => runTest('ldap')}
                disabled={!ldapTest.username || !ldapTest.password || testing === 'ldap'}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap"
              >
                <PlugZap className="w-4 h-4" />
                {testing === 'ldap' ? 'Testing…' : 'Save & test'}
              </button>
            </div>
            <p className={hintCls}>The password is only used for this check and is not stored.</p>
            <StatusLine status={status.testLdap ?? null} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* General */}
        <Card icon={Globe} title="General" description="Links and accounts.">
          <div className="space-y-4">
            <div>
              <label htmlFor="app-url" className={label}>App address</label>
              <input id="app-url" className={input} value={general.appUrl} onChange={(e) => update('general', { appUrl: e.target.value })} placeholder="https://sign.company.com" />
              <p className={hintCls}>Used for the “Review and sign” links in emails.</p>
            </div>
            <div>
              <label htmlFor="email-domain" className={label}>Default email domain</label>
              <input id="email-domain" className={input} value={general.emailDomain} onChange={(e) => update('general', { emailDomain: e.target.value })} placeholder="company.com" />
              <p className={hintCls}>Signers entered as “jdoe” become jdoe@this-domain.</p>
            </div>
            <div>
              <label htmlFor="admin-emails" className={label}>Admin emails</label>
              <textarea
                id="admin-emails"
                rows={3}
                className={input}
                value={general.adminEmails.join(', ')}
                onChange={(e) => update('general', { adminEmails: e.target.value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean) })}
                placeholder="it.admin@company.com, ops@company.com"
              />
              <p className={hintCls}>These people always get admin rights when they sign in.</p>
            </div>
          </div>
          <SaveButton section="general" />
        </Card>

        {/* Security */}
        <Card icon={ShieldCheck} title="Security" description="Sessions and passwords.">
          <div className="space-y-4">
            <div>
              <label htmlFor="session-hours" className={label}>Session length (hours)</label>
              <input id="session-hours" type="number" min={1} max={720} className={input} value={security.sessionHours} onChange={(e) => update('security', { sessionHours: Number(e.target.value) })} />
              <p className={hintCls}>People are signed out after this long. Applies to new sign-ins.</p>
            </div>
            <div>
              <label htmlFor="min-password" className={label}>Minimum password length</label>
              <input id="min-password" type="number" min={8} max={128} className={input} value={security.minPasswordLength} onChange={(e) => update('security', { minPasswordLength: Number(e.target.value) })} />
              <p className={hintCls}>For local accounts created by admins. Active Directory passwords follow your domain policy.</p>
            </div>
          </div>
          <SaveButton section="security" />
        </Card>
      </div>
    </div>
  );
};

export default SystemSettings;
