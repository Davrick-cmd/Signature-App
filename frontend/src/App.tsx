import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import DocumentUpload from './components/DocumentUpload';
import SignatureCreator from './components/SignatureCreator';
import DocumentViewer from './components/DocumentViewer';
import Reports from './components/Reports';
import AdminDashboard from './components/AdminDashboard';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import EmailModal from './components/EmailModal';
import { Document } from './types';
import { isAuthenticated, getCurrentUser } from './services/authService';
import { API_ENDPOINTS, apiFetch, downloadFile } from './config/api';

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'upload' | 'signature' | 'viewer' | 'reports' | 'admin'>('dashboard');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedDocumentForEmail, setSelectedDocumentForEmail] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [signatureRequests, setSignatureRequests] = useState<Document[]>([]);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());
    setIsInitialized(true);
    // Set welcome name after login
    const user = getCurrentUser();
    if (user) {
      let firstName = user.name || user.username;
      if (firstName && firstName.includes(' ')) {
        firstName = firstName.split(' ')[0];
      }
      setWelcomeName(firstName);
      // Fetch user's own documents - always use email format
      const userId = user.email || '';
      apiFetch(`${API_ENDPOINTS.DOCUMENTS}?user=${encodeURIComponent(userId)}&filter=my-documents`)
        .then(res => res.json())
        .then(data => setDocuments(data))
        .catch(() => setDocuments([]));
      // Fetch all documents for potential signing (excluding user's own)
      apiFetch(`${API_ENDPOINTS.DOCUMENTS}?user=${encodeURIComponent(userId)}&filter=for-signing`)
        .then(res => res.json())
        .then(data => {
          // Filter out completed documents and user's own documents for signature requests
          const filteredRequests = data.filter(doc => 
            doc.status !== 'completed' && 
            doc.uploaded_by !== userId
          );
          setSignatureRequests(filteredRequests);
        })
        .catch(() => setSignatureRequests([]));
    }
    // Deep link handler for /sign/:id links coming from email
    const path = window.location.pathname || '';
    const params = new URLSearchParams(window.location.search);
    const expectedSigner = params.get('signer') || undefined;
    const signMatch = path.match(/^\/sign\/(\d+)/);
    if (signMatch) {
      const deeplinkDocId = signMatch[1];
      // If not logged in yet, keep location so after login we can open it
      if (!isAuthenticated()) {
        // no-op here; after login effect below will pick it up
      } else {
        openDeepLink(deeplinkDocId, expectedSigner);
      }
    }
  }, []);

  // Opens a /sign/:id link from an email; documents the user can't access fall back to the dashboard
  const openDeepLink = (docId: string, expectedSigner?: string) => {
    apiFetch(API_ENDPOINTS.DOCUMENT(docId))
      .then(async (res) => {
        const doc = await res.json();
        window.history.replaceState(null, '', '/');
        if (!res.ok || !Array.isArray(doc.signers)) {
          alert(doc.error === 'Document not found'
            ? 'This document does not exist or is not shared with your account.'
            : doc.error || 'Could not open the document.');
          return;
        }
        (doc as any).__expectedSigner = expectedSigner;
        setCurrentView('viewer');
        setSelectedDocument(doc);
      })
      .catch(() => {});
  };

  const fetchDocuments = () => {
    const user = getCurrentUser();
    const userId = user?.email || '';
    // Fetch user's own documents
    apiFetch(`${API_ENDPOINTS.DOCUMENTS}?user=${encodeURIComponent(userId)}&filter=my-documents`)
      .then(res => res.json())
      .then(data => setDocuments(data))
      .catch(() => setDocuments([]));
    // Fetch all documents for potential signing (excluding user's own)
    apiFetch(`${API_ENDPOINTS.DOCUMENTS}?user=${encodeURIComponent(userId)}&filter=for-signing`)
      .then(res => res.json())
      .then(data => {
        // Filter out completed documents and user's own documents for signature requests
        const filteredRequests = data.filter(doc => 
          doc.status !== 'completed' && 
          doc.uploaded_by !== userId
        );
        setSignatureRequests(filteredRequests);
      })
      .catch(() => setSignatureRequests([]));
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    // Fetch documents immediately after login
    setTimeout(() => {
      fetchDocuments();
      // If user came via /sign/:id deeplink, open it now
      const path = window.location.pathname || '';
      const signMatch = path.match(/^\/sign\/(\d+)/);
      const params = new URLSearchParams(window.location.search);
      const expectedSigner = params.get('signer') || undefined;
      if (signMatch) {
        const deeplinkDocId = signMatch[1];
        openDeepLink(deeplinkDocId, expectedSigner);
      }
    }, 100); // Small delay to ensure state is updated
  };

  const handleUploadDocument = (document: Omit<Document, 'id'>) => {
    // Don't add to local state immediately - wait for backend response
    setCurrentView('dashboard');
    // Refresh from backend to get the newly uploaded document
    setTimeout(() => {
      fetchDocuments();
    }, 500); // Small delay to allow backend processing
  };

  const handleViewDocument = (document: Document) => {
    setSelectedDocument(document);
    setCurrentView('viewer');
  };

  const handleSendForSignature = (document: Document) => {
    setSelectedDocumentForEmail(document);
    setEmailModalOpen(true);
  };

  const handleEmailSent = () => {
    // Update document status to 'in-progress' after email is sent
    if (selectedDocumentForEmail) {
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === selectedDocumentForEmail.id 
            ? { ...doc, status: 'in-progress' as const }
            : doc
        )
      );
    }
    setEmailModalOpen(false);
    setSelectedDocumentForEmail(null);
    fetchDocuments(); // Refresh from backend
  };

  const handleDeleteDocument = async (document: Document) => {
    try {
      const response = await apiFetch(API_ENDPOINTS.DOCUMENT(document.id), {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove from local state immediately for better UX
        setDocuments(prev => prev.filter(doc => doc.id !== document.id));
        setSignatureRequests(prev => prev.filter(doc => doc.id !== document.id));
        alert('Document deleted successfully!');
      } else {
        const data = await response.json();
        alert('Failed to delete document: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error deleting document: ' + error);
    }
  };

  // Download document by ID
  const handleDownloadDocument = async (documentId: string) => {
    try {
      await downloadFile(API_ENDPOINTS.DOCUMENT_DOWNLOAD(documentId));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Download failed');
    }
  };

  // Send reminder for a document
  const handleSendReminder = async (documentId: string) => {
    const response = await apiFetch(API_ENDPOINTS.DOCUMENT_REMIND(documentId), { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    alert(response.ok ? data.message || 'Reminder sent!' : data.error || 'Failed to send reminder');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'upload':
        return <DocumentUpload onUpload={handleUploadDocument} onCancel={() => setCurrentView('dashboard')} />;
      case 'signature':
        return <SignatureCreator onBack={() => setCurrentView('dashboard')} />;
      case 'viewer':
        return selectedDocument ? (
          <DocumentViewer 
            document={selectedDocument} 
            onBack={() => setCurrentView('dashboard')} 
            onDocumentSigned={fetchDocuments}
          />
        ) : null;
      case 'reports':
        return <Reports documents={documents} />;
      case 'admin':
        return <AdminDashboard documents={documents} />;
      default:
        return (
          <>
            {welcomeName && (
              <div className="text-2xl font-bold text-blue-700 mb-6 text-center">
                Welcome back, {welcomeName}
              </div>
            )}
            <Dashboard 
              documents={documents}
              signatureRequests={signatureRequests}
              onUpload={() => setCurrentView('upload')}
              onCreateSignature={() => setCurrentView('signature')}
              onViewDocument={handleViewDocument}
              onSendForSignature={handleSendForSignature}
              onDeleteDocument={handleDeleteDocument}
              onDownloadDocument={handleDownloadDocument}
              onSendReminder={handleSendReminder}
            />
          </>
        );
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing application...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header currentView={currentView} onNavigate={setCurrentView} />
      <main className="pt-16">
        {renderCurrentView()}
      </main>
      {/* Email Modal */}
      {selectedDocumentForEmail && (
        <EmailModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setSelectedDocumentForEmail(null);
          }}
          document={selectedDocumentForEmail}
          onEmailSent={handleEmailSent}
        />
      )}
    </div>
  );
}

export default App;