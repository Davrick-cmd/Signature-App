export interface Document {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  uploadDate: string;
  signers: string[];
  size: string;
  uploaded_by?: string;
  file_url?: string;
  nextSigner?: string | null;
  expiresAt?: string | null;
}

export interface Signature {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface SignatureField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  signer: string;
  type: 'signature' | 'initial' | 'date' | 'text';
}

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  last_login?: string;
}

export interface AdminStats {
  totalUsers: number;
  totalDocuments: number;
  documentsThisMonth: number;
  completedDocuments: number;
  pendingDocuments: number;
  inProgressDocuments: number;
  averageCompletionTime: number;
  topSigners: Array<{
    email: string;
    count: number;
  }>;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  documentId?: string;
  documentName?: string;
  timestamp: string;
  details?: string;
}