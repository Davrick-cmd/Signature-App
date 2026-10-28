import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Plus, Trash2 } from 'lucide-react';
import { Document } from '../types';
import { getCurrentUser } from '../services/authService';
import { API_ENDPOINTS, apiFetch } from '../config/api';

interface DocumentUploadProps {
  onUpload: (document: Omit<Document, 'id'>) => void;
  onCancel: () => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onUpload, onCancel }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<string[]>(['']);
  const [documentName, setDocumentName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        setSelectedFile(file);
        setDocumentName(file.name);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setDocumentName(file.name);
    }
  };

  const addSigner = () => {
    setSigners([...signers, '']);
  };

  const removeSigner = (index: number) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const updateSigner = (index: number, value: string) => {
    const newSigners = [...signers];
    newSigners[index] = value;
    setSigners(newSigners);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !documentName) return;
    const validSigners = signers.filter(email => email.trim() !== '');
    const currentUser = getCurrentUser();
    const formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('name', documentName);
    formData.append('signers', JSON.stringify(validSigners));
    formData.append('uploaded_by', currentUser?.email || '');
    try {
      const response = await apiFetch(API_ENDPOINTS.UPLOAD, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        let message = 'Document uploaded and saved successfully!';
        
        // Add information about uploader as first signer if applicable
        if (data.uploaderAssignedAsFirst) {
          message += '\n\n✅ You have been automatically assigned as the first signer in the workflow.';
        }
        
        if (data.signers && data.signers.length > 0) {
          message += `\n\n📋 Signing Order:\n${data.signers.map((signer: string, index: number) => 
            `${index + 1}. ${signer}${index === 0 && data.uploaderAssignedAsFirst ? ' (You - First)' : ''}`
          ).join('\n')}`;
        }
        
        alert(message);
        setSelectedFile(null);
        setDocumentName('');
        setSigners(['']);
        if (onUpload) onUpload(data.metadata);
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Upload failed: ' + err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Document</h1>
        <p className="text-gray-600">Upload a document and set up the signing process</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* File Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Upload</h2>
          
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragOver 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Drag and drop your document here
              </h3>
              <p className="text-gray-600 mb-4">
                or click to browse your files
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Select File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="text-sm text-gray-500 mt-4">
                Supported formats: PDF, JPG, PNG (Max 10MB)
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-sm text-gray-600">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setDocumentName('');
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Document Details */}
        {selectedFile && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Details</h2>
            
            <div className="mb-6">
              <label htmlFor="documentName" className="block text-sm font-medium text-gray-700 mb-2">
                Document Name
              </label>
              <input
                id="documentName"
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter document name"
                required
              />
            </div>
          </div>
        )}

        {/* Signers */}
        {selectedFile && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Signers</h2>
              <button
                type="button"
                onClick={addSigner}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Add Signer</span>
              </button>
            </div>
            
            {/* Uploader as First Signer Info */}
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-blue-700">ℹ️</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-blue-900 mb-1">Signing Order Information</h4>
                  <p className="text-sm text-blue-700">
                    <strong>Automatic First Signer:</strong> If you include your own email in the signers list, 
                    you will automatically be assigned as the first signer in the workflow.
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    <strong>Signing Order:</strong> Signers will be notified in the order listed below. 
                    Each signer must complete their signature before the next signer is notified.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {signers.map((signer, index) => {
                const currentUser = getCurrentUser();
                const isCurrentUser = currentUser && (
                  signer.toLowerCase() === currentUser.email?.toLowerCase() ||
                  signer.toLowerCase() === ''.toLowerCase()
                );
                
                return (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="email"
                          value={signer}
                          onChange={(e) => updateSigner(index, e.target.value)}
                          className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isCurrentUser ? 'border-blue-300 bg-blue-50' : ''
                          }`}
                          placeholder="Enter signer email"
                        />
                        {isCurrentUser && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                              You (First)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {signers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSigner(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedFile || !documentName}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            Upload & Send for Signature
          </button>
        </div>
      </form>
    </div>
  );
};

export default DocumentUpload;