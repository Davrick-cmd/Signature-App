import { useEffect, useState } from 'react';
import { APP_NAME, apiUrl } from '../config/api';

export interface Branding {
  appName: string;
  displayName: string;
  logoUrl: string | null;
}

const fallback: Branding = { appName: APP_NAME, displayName: APP_NAME, logoUrl: null };
let cached: Promise<Branding> | null = null;

// Fetched once per page load; the customer's logo and name are set in Admin → Settings
export const loadBranding = (): Promise<Branding> => {
  if (!cached) {
    cached = fetch(apiUrl('/api/branding'))
      .then((res) => (res.ok ? res.json() : fallback))
      .then((b: Branding) => {
        document.title = b.displayName;
        return { ...b, logoUrl: b.logoUrl ? apiUrl(b.logoUrl) : null };
      })
      .catch(() => fallback);
  }
  return cached;
};

export const useBranding = (): Branding => {
  const [branding, setBranding] = useState<Branding>(fallback);
  useEffect(() => {
    let active = true;
    loadBranding().then((b) => active && setBranding(b));
    return () => { active = false; };
  }, []);
  return branding;
};
