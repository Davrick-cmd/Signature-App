import { API_ENDPOINTS, apiFetch } from '../config/api';

// Emails a signing request to the document's next pending signer.
// The server builds the email; only the optional message comes from the client.
export const sendSigningRequest = async (documentId: string, message?: string): Promise<string> => {
  const response = await apiFetch(API_ENDPOINTS.DOCUMENT_SHARE(documentId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message || undefined }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Failed to send signing request');
  return data.to;
};

// Utility function to validate email addresses
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Utility function to validate multiple email addresses
export const validateEmails = (emails: string[]): { valid: string[]; invalid: string[] } => {
  const valid: string[] = [];
  const invalid: string[] = [];

  emails.forEach(email => {
    const trimmedEmail = email.trim();
    if (validateEmail(trimmedEmail)) {
      valid.push(trimmedEmail);
    } else {
      invalid.push(trimmedEmail);
    }
  });

  return { valid, invalid };
};
