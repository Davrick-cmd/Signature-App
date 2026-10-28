import React, { useState } from 'react';
import { X, Mail, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { sendSigningRequest } from '../services/emailService';
import { Document } from '../types';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  onEmailSent: () => void;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, document, onEmailSent }) => {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendEmail = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sentTo = await sendSigningRequest(document.id, message);
      setSuccess(sentTo);
      setTimeout(() => {
        onEmailSent();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Send for Signature</h2>
              <p className="text-sm text-gray-600">{document.name}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:cursor-not-allowed"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {success && (
            <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Request sent to {success}</p>
                <p className="text-sm text-green-600">They will receive a link to review and sign.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Signers (fixed at upload; emailed one at a time in order) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Signing order</label>
            {document.signers.length === 0 ? (
              <p className="text-sm text-gray-500">No signers were added to this document.</p>
            ) : (
              <ol className="space-y-2">
                {document.signers.map((signer, index) => (
                  <li key={signer} className="flex items-center space-x-3 px-4 py-3 border border-gray-200 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm text-gray-800">{signer}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-gray-500 mt-2">
              The next signer who has not yet signed receives this request. Others are notified automatically in turn.
            </p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Add a personal message to the signer..."
              disabled={isLoading}
            />
          </div>

          {/* Document Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Document Details</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">Name:</span> {document.name}</p>
              <p><span className="font-medium">Size:</span> {document.size}</p>
              <p><span className="font-medium">Upload Date:</span> {document.uploadDate}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-4 p-6 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSendEmail}
            disabled={isLoading || !!success || document.signers.length === 0}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send for Signature</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailModal;
