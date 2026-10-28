import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { apiFetch, apiUrl } from '../config/api';
import { loadBranding, Branding } from '../services/brandingService';

// Lets each customer's admin set their own logo and product name
const BrandingSettings: React.FC = () => {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    loadBranding().then((b) => {
      setBranding(b);
      setDisplayName(b.displayName === b.appName ? '' : b.displayName);
    });
  }, []);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const apply = async (request: Promise<Response>, success: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await request;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save branding');
      setBranding({ ...data, logoUrl: data.logoUrl ? apiUrl(data.logoUrl) : null });
      setFile(null);
      setMessage({ ok: true, text: `${success} Reloading to apply…` });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save branding' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const form = new FormData();
    if (file) form.append('logo', file);
    form.append('displayName', displayName);
    apply(apiFetch('/api/admin/branding', { method: 'PUT', body: form }), 'Branding saved.');
  };

  const handleRemoveLogo = () => {
    apply(apiFetch('/api/admin/branding/logo', { method: 'DELETE' }), 'Logo removed.');
  };

  const shownLogo = preview || branding?.logoUrl;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Branding</h3>
      <p className="text-sm text-gray-500 mb-6">Your logo appears on the sign-in page and in the header.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium text-gray-900 mb-2">Logo</p>
          <div className="h-32 border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 p-4">
            {shownLogo ? (
              <img src={shownLogo} alt="Logo preview" className="max-h-24 max-w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <ImageIcon className="w-8 h-8 mb-1" />
                <span className="text-xs">No logo yet</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <label htmlFor="branding-logo" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <Upload className="w-4 h-4" />
              <span>{file ? file.name : 'Choose image'}</span>
            </label>
            <input
              id="branding-logo"
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {branding?.logoUrl && !file && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={saving}
                className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">PNG or JPEG, up to 2 MB. A wide logo on a transparent or white background works best.</p>
        </div>

        <div>
          <label htmlFor="branding-name" className="block text-sm font-medium text-gray-900 mb-2">Product name</label>
          <input
            id="branding-name"
            type="text"
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={branding?.appName || 'SignFlow'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-2">Shown in the header and browser tab, for example “Acme Sign”. Leave empty to use {branding?.appName || 'SignFlow'}.</p>
        </div>
      </div>

      {message && (
        <p className={`mt-4 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium"
        >
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </div>
  );
};

export default BrandingSettings;
