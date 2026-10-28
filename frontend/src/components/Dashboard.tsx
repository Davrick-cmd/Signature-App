import React, { useState } from 'react';
import { Plus, FileText, Users, Clock, CheckCircle, AlertCircle, Search, Filter, Send, LogOut, Trash2, Eye, Download } from 'lucide-react';
import { Document } from '../types';
import { getCurrentUser, logoutUser } from '../services/authService';

interface DashboardProps {
  documents: Document[];
  signatureRequests: Document[];
  onUpload: () => void;
  onCreateSignature: () => void;
  onViewDocument: (document: Document) => void;
  onSendForSignature: (document: Document) => void;
  onDeleteDocument: (document: Document) => void;
  onDownloadDocument: (documentId: string) => void;
  onSendReminder: (documentId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  documents, 
  signatureRequests,
  onUpload, 
  onCreateSignature, 
  onViewDocument, 
  onSendForSignature, 
  onDeleteDocument,
  onDownloadDocument,
  onSendReminder
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'my-documents' | 'to-sign'>('my-documents');
  const currentUser = getCurrentUser();
  const [deleteConfirm, setDeleteConfirm] = useState<Document | null>(null);

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in-progress':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: Document['status']) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'in-progress':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'cancelled':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  // Filter documents based on active tab
  const getFilteredDocuments = () => {
    let docsToShow = activeTab === 'my-documents' ? documents : signatureRequests;
    
    return docsToShow.filter(doc => {
      const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  };

  const filteredDocuments = getFilteredDocuments();

  const stats = {
    total: documents.length,
    pending: documents.filter(d => d.status === 'pending').length,
    inProgress: documents.filter(d => d.status === 'in-progress').length,
    completed: documents.filter(d => d.status === 'completed').length,
    toSign: signatureRequests.length,
  };

  const handleLogout = () => {
    logoutUser();
  };

  const getSigningProgress = (document: Document) => {
    if (!document.signatures) return { signed: 0, total: document.signers.length };
    const signed = document.signatures.length;
    const total = document.signers.length;
    return { signed, total };
  };

  const getSigningStatus = (document: Document) => {
    const progress = getSigningProgress(document);
    const signatures = document.signatures || [];
    
    if (progress.signed === 0) {
      return {
        status: 'pending',
        message: 'Waiting for first signer',
        color: 'text-yellow-600'
      };
    } else if (progress.signed === progress.total) {
      return {
        status: 'completed',
        message: 'All signatures complete',
        color: 'text-green-600'
      };
    } else {
      const nextSigner = document.nextSigner;
      return {
        status: 'in-progress',
        message: nextSigner ? `Waiting for ${nextSigner}` : 'In progress',
        color: 'text-blue-600'
      };
    }
  };

  const getSigningDetails = (document: Document) => {
    const signatures = document.signatures || [];
    const signers = document.signers || [];
    
    return signers.map(signer => {
      const hasSigned = signatures.some(sig => 
        sig.signerEmail?.toLowerCase() === signer.toLowerCase()
      );
      
      return {
        signer,
        hasSigned,
        signedAt: hasSigned ? signatures.find(sig => 
          sig.signerEmail?.toLowerCase() === signer.toLowerCase()
        )?.signedAt : null
      };
    });
  };

  const renderTimeline = (document: Document) => {
    const details = getSigningDetails(document);
    const nextSigner = document.nextSigner;
    const completed = details.filter(d => d.hasSigned).map(d => d.signer);
    const current = nextSigner || (details.find(d => !d.hasSigned)?.signer || null);
    return (
      <div className="flex items-center flex-wrap gap-2 mt-1">
        {/* Completed signers */}
        {completed.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Completed:</span>
            {completed.map(s => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{s}</span>
            ))}
          </div>
        )}
        {/* Current signer */}
        {current && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Current:</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{current}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {currentUser?.name || currentUser?.username || 'User'}
            </h1>
            <p className="text-gray-600">Manage your documents and signatures</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">My Documents</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">To Sign</p>
              <p className="text-2xl font-bold text-orange-600">{stats.toSign}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
            </div>
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={onUpload}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-6 transition-colors group"
          >
            <div className="flex items-center space-x-4">
              <div className="bg-blue-500 rounded-lg p-3 group-hover:bg-blue-400 transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Upload Document</h3>
                <p className="text-blue-100">Add a new document for signing</p>
              </div>
            </div>
          </button>
          
          <button
            onClick={onCreateSignature}
            className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-6 transition-colors group"
          >
            <div className="flex items-center space-x-4">
              <div className="bg-gray-100 rounded-lg p-3 group-hover:bg-gray-200 transition-colors">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Create Signature</h3>
                <p className="text-gray-600">Create and save your signature</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Documents Section with Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('my-documents')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my-documents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Uploaded Documents ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab('to-sign')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'to-sign'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Documents to Sign ({signatureRequests.length})
            </button>
          </nav>
        </div>

        {/* Search and Filter */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h2 className="text-xl font-semibold text-gray-900">
              {activeTab === 'my-documents' ? 'My Uploaded Documents' : 'My Documents to Sign'}
            </h2>
            
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Documents Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Signers</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDocuments.map((document) => {
                const progress = getSigningProgress(document);
                return (
                  <tr 
                    key={document.id} 
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(document.status)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{document.name}</p>
                          {activeTab === 'to-sign' && (
                            <p className="text-xs text-gray-500">From: {document.uploaded_by}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={getStatusBadge(document.status)}>
                        {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{document.signers.length}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${(progress.signed / progress.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">
                            {progress.signed}/{progress.total}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {getSigningStatus(document).message}
                        </div>
                        {document.status !== 'pending' && renderTimeline(document)}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">{document.uploadDate}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{document.size}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        {activeTab === 'to-sign' ? (
                          // Actions for documents to sign
                          <>
                            <button
                              onClick={() => onViewDocument(document)}
                              className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              <Eye className="w-4 h-4" />
                              <span>View & Sign</span>
                            </button>
                            <button
                              onClick={() => onDownloadDocument(document.id)}
                              className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
                              title="Download document"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </button>
                          </>
                        ) : (
                          // Actions for uploaded documents
                          <>
                            <button
                              onClick={() => onViewDocument(document)}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              View
                            </button>
                            {document.status === 'pending' && (
                              <button
                                onClick={() => onSendForSignature(document)}
                                className="flex items-center space-x-1 text-green-600 hover:text-green-700 text-sm font-medium"
                              >
                                <Send className="w-3 h-3" />
                                <span>Send</span>
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteConfirm(document)}
                              className="flex items-center space-x-1 text-red-600 hover:text-red-700 text-sm font-medium"
                              title="Delete document"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                            <button
                              onClick={() => onDownloadDocument(document.id)}
                              className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
                              title="Download document"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </button>
                            {document.status !== 'completed' && document.nextSigner && (
                              <button
                                onClick={() => onSendReminder(document.id)}
                                className="flex items-center space-x-1 text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                                title="Remind next signer"
                              >
                                <Clock className="w-4 h-4" />
                                <span>Remind Next</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredDocuments.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {activeTab === 'my-documents' 
                  ? 'No documents uploaded yet. Click "Upload Document" to get started.'
                  : 'No documents requiring your signature at the moment.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4">Delete Document</h3>
            <p className="mb-6">Are you sure you want to delete <span className="font-bold">{deleteConfirm.name}</span>? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteDocument(deleteConfirm);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;