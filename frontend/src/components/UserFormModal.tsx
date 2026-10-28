import React, { useState } from 'react';
import { X, UserPlus, KeyRound, Wand2, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../config/api';

interface Props {
  // Without a user the form creates one; with a user it resets that user's password
  user?: { id: string; name: string; email: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const label = 'block text-sm font-medium text-gray-700 mb-1';

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

const UserFormModal: React.FC<Props> = ({ user, onClose, onSaved }) => {
  const isReset = !!user;
  const [form, setForm] = useState({ name: '', email: '', role: 'user' as 'user' | 'admin', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = isReset
        ? await apiFetch(`/api/users/${user!.id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: form.password }),
          })
        : await apiFetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.details) ? data.details.map((d: { path: string; msg: string }) => `${d.path}: ${d.msg}`).join(', ') : '';
        throw new Error(detail || data.error || 'Could not save');
      }
      setDone({ email: isReset ? user!.email : data.email, password: form.password });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!done) return;
    const text = `Sign in at ${window.location.origin}\nUsername: ${done.email}\nPassword: ${done.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed; select the details and copy them manually.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              {isReset ? <KeyRound className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </span>
            <div>
              <h2 id="user-form-title" className="text-lg font-semibold text-gray-900">{isReset ? 'Reset password' : 'Add user'}</h2>
              <p className="text-sm text-gray-500">{isReset ? user!.email : 'Creates a local account that signs in on the Admin tab'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-none mt-0.5" />
              <p className="text-sm text-green-800">{isReset ? 'Password updated.' : 'User created.'} Share these sign-in details with them privately.</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm font-mono select-all break-all text-gray-900">
              <div>Username: {done.email}</div>
              <div>Password: {done.password}</div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={copy} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy details'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-4">
            {!isReset && (
              <>
                <div>
                  <label htmlFor="new-user-name" className={label}>Full name</label>
                  <input id="new-user-name" className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
                </div>
                <div>
                  <label htmlFor="new-user-email" className={label}>Email</label>
                  <input id="new-user-email" type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  <p className="text-xs text-gray-500 mt-1">They sign in with this email, or with the part before the @.</p>
                </div>
                <div>
                  <label htmlFor="new-user-role" className={label}>Role</label>
                  <select id="new-user-role" className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'user' | 'admin' })}>
                    <option value="user">User: upload, send and sign documents</option>
                    <option value="admin">Administrator: also manage users and settings</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label htmlFor="new-user-password" className={label}>{isReset ? 'New password' : 'Password'}</label>
              <div className="flex gap-2">
                <input
                  id="new-user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={input}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  autoFocus={isReset}
                />
                <button
                  type="button"
                  onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPassword(true); }}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  title="Generate a strong password"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate
                </button>
              </div>
              <label className="inline-flex items-center gap-2 mt-2 text-xs text-gray-500">
                <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                Show password
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <AlertCircle className="w-4 h-4 text-red-600 flex-none mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg">
                {saving ? 'Saving…' : isReset ? 'Set password' : 'Create user'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserFormModal;
