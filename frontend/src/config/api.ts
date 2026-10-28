// API Configuration
// In development the API runs on :3001; in production it is served from the same origin
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'SignFlow';

export const TOKEN_KEY = 'signflow.token';

export const API_ENDPOINTS = {
  // Authentication
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  ME: `${API_BASE_URL}/api/auth/me`,
  CONFIG: `${API_BASE_URL}/api/config`,

  // Documents
  DOCUMENTS: `${API_BASE_URL}/api/documents`,
  DOCUMENT: (id: string) => `${API_BASE_URL}/api/documents/${id}`,
  DOCUMENT_FILE: (id: string) => `${API_BASE_URL}/api/documents/${id}/file`,
  DOCUMENT_FIELDS: (id: string) => `${API_BASE_URL}/api/documents/${id}/fields`,
  DOCUMENT_SEND: (id: string) => `${API_BASE_URL}/api/documents/${id}/send`,
  DOCUMENT_SHARE: (id: string) => `${API_BASE_URL}/api/documents/${id}/share`,
  DOCUMENT_SIGN: (id: string) => `${API_BASE_URL}/api/documents/${id}/sign`,
  DOCUMENT_DECLINE: (id: string) => `${API_BASE_URL}/api/documents/${id}/decline`,
  DOCUMENT_DOWNLOAD: (id: string) => `${API_BASE_URL}/api/documents/${id}/download`,
  DOCUMENT_REMIND: (id: string) => `${API_BASE_URL}/api/documents/${id}/remind`,
  DOCUMENT_DELETE: (id: string) => `${API_BASE_URL}/api/documents/${id}`,
  DOCUMENT_GENERATE_PDF: (id: string) => `${API_BASE_URL}/api/documents/${id}/generate-final-pdf`,

  // Upload
  UPLOAD: `${API_BASE_URL}/api/upload`,

  // Users
  USERS: `${API_BASE_URL}/api/users`,
  USER_ROLE: (id: string) => `${API_BASE_URL}/api/users/${id}/role`,
  USER: (id: string) => `${API_BASE_URL}/api/users/${id}`,

  // Admin
  ADMIN_STATS: `${API_BASE_URL}/api/admin/stats`,
  ADMIN_LOGS: `${API_BASE_URL}/api/admin/activity-logs`,
};

// Resolve a server-relative path such as a document's file_url
export const apiUrl = (pathOrUrl: string) => (pathOrUrl.startsWith('/') ? `${API_BASE_URL}${pathOrUrl}` : pathOrUrl);

export const authHeaders = (): Record<string, string> => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// fetch() wrapper that attaches the session token and signs out on expiry
export const apiFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  Object.entries(authHeaders()).forEach(([k, v]) => headers.set(k, v));
  const response = await fetch(apiUrl(input), { ...init, headers });
  if (response.status === 401 && sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.clear();
    window.location.reload();
  }
  return response;
};

// Downloads a protected file by fetching it with the session token
export const downloadFile = async (url: string, fallbackName = 'document.pdf') => {
  const response = await apiFetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const blobUrl = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

export default API_BASE_URL;
