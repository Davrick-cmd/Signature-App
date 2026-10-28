import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Download,
  Calendar,
  PieChart,
  BarChart3
} from 'lucide-react';
import { Document } from '../types';
import { getCurrentUser } from '../services/authService';

interface ReportsProps {
  documents: Document[];
}

const Reports: React.FC<ReportsProps> = ({ documents }) => {
  const currentUser = getCurrentUser();
  const [dateRange, setDateRange] = useState('30');
  const [reportType, setReportType] = useState<'overview' | 'document-list'>('overview');

  // Filter documents for current user
  const userEmail = currentUser?.email || '';
  const userDocuments = documents.filter(doc => {
    return doc.uploaded_by === userEmail || doc.signers.some(signer => 
      signer.toLowerCase() === userEmail.toLowerCase()
    );
  });

  // Stats calculations
  const stats = {
    totalDocuments: userDocuments.length,
    completedDocuments: userDocuments.filter(d => d.status === 'completed').length,
    pendingDocuments: userDocuments.filter(d => d.status === 'pending').length,
    inProgressDocuments: userDocuments.filter(d => d.status === 'in-progress').length,
  };

  const completionRate = stats.totalDocuments > 0 
    ? Math.round((stats.completedDocuments / stats.totalDocuments) * 100) 
    : 0;

  // Filter documents by date range
  const filterByDateRange = (docs: typeof userDocuments) => {
    const now = new Date();
    const daysAgo = new Date(now.getTime() - parseInt(dateRange) * 24 * 60 * 60 * 1000);
    return docs.filter(doc => new Date(doc.uploadDate) >= daysAgo);
  };

  const filteredDocuments = filterByDateRange(userDocuments);

  // Calculate stats for filtered documents
  const filteredStats = {
    totalDocuments: filteredDocuments.length,
    completedDocuments: filteredDocuments.filter(d => d.status === 'completed').length,
    pendingDocuments: filteredDocuments.filter(d => d.status === 'pending').length,
    inProgressDocuments: filteredDocuments.filter(d => d.status === 'in-progress').length,
  };

  // Calculate signature statistics
  const signatureStats = {
    documentsRequiringSignature: userDocuments.filter(doc => 
      doc.signers.some(signer => signer.toLowerCase() === userEmail.toLowerCase()) && 
      doc.uploaded_by !== userEmail
    ).length,
    documentsUploaded: userDocuments.filter(doc => doc.uploaded_by === userEmail).length,
    averageSignersPerDocument: userDocuments.length > 0 
      ? Math.round(userDocuments.reduce((sum, doc) => sum + doc.signers.length, 0) / userDocuments.length * 10) / 10
      : 0
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const exportReport = () => {
    // Create CSV content
    const headers = ['Document Name', 'Status', 'Upload Date', 'Signers', 'Uploaded By', 'Type'];
    const csvContent = [
      headers.join(','),
      ...filteredDocuments.map(doc => [
        `"${doc.name}"`,
        doc.status,
        formatDate(doc.uploadDate),
        doc.signers.length,
        doc.uploaded_by === userEmail ? 'You' : doc.uploaded_by,
        doc.uploaded_by === userEmail ? 'Uploaded' : 'To Sign'
      ].join(','))
    ].join('\n');
    
    // Add summary at the top
    const summaryContent = [
      `Document Report - ${currentUser?.name || currentUser?.username}`,
      `Generated on: ${new Date().toLocaleDateString()}`,
      `Date Range: Last ${dateRange} days`,
      '',
      `Total Documents: ${filteredStats.totalDocuments}`,
      `Completed: ${filteredStats.completedDocuments}`,
      `Pending: ${filteredStats.pendingDocuments}`,
      `In Progress: ${filteredStats.inProgressDocuments}`,
      `Documents You Uploaded: ${signatureStats.documentsUploaded}`,
      `Documents Requiring Your Signature: ${signatureStats.documentsRequiringSignature}`,
      '',
      ''
    ].join('\n');
    
    const fullContent = summaryContent + csvContent;
    
    const dataBlob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `document_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Reports</h1>
            <p className="text-gray-600">
              Overview of your document activity and signature status
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <button
              onClick={exportReport}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setReportType('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                reportType === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <PieChart className="w-4 h-4 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setReportType('document-list')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                reportType === 'document-list'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Document List
            </button>
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {reportType === 'overview' && (
        <div className="space-y-8">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredStats.totalDocuments}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
              <div className="mt-2">
                <span className="text-sm text-gray-500">Last {dateRange} days</span>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{filteredStats.completedDocuments}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div className="mt-2">
                <span className="text-sm text-gray-500">{completionRate}% completion rate</span>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Documents Uploaded</p>
                  <p className="text-2xl font-bold text-blue-600">{signatureStats.documentsUploaded}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
              <div className="mt-2">
                <span className="text-sm text-gray-500">By you</span>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Awaiting Signature</p>
                  <p className="text-2xl font-bold text-orange-600">{signatureStats.documentsRequiringSignature}</p>
                </div>
                <Clock className="w-8 h-8 text-orange-500" />
              </div>
              <div className="mt-2">
                <span className="text-sm text-gray-500">Requiring your signature</span>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Document Status Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Status Distribution</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span className="text-sm text-gray-600">Completed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">{filteredStats.completedDocuments}</span>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${filteredStats.totalDocuments > 0 ? (filteredStats.completedDocuments / filteredStats.totalDocuments) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-blue-500 rounded"></div>
                    <span className="text-sm text-gray-600">In Progress</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">{filteredStats.inProgressDocuments}</span>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ width: `${filteredStats.totalDocuments > 0 ? (filteredStats.inProgressDocuments / filteredStats.totalDocuments) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                    <span className="text-sm text-gray-600">Pending</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">{filteredStats.pendingDocuments}</span>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full" 
                        style={{ width: `${filteredStats.totalDocuments > 0 ? (filteredStats.pendingDocuments / filteredStats.totalDocuments) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Activity Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Activity Summary</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Average Signers per Document</span>
                  <span className="text-sm font-medium">{signatureStats.averageSignersPerDocument}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Documents You Uploaded</span>
                  <span className="text-sm font-medium">{signatureStats.documentsUploaded}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Documents to Sign</span>
                  <span className="text-sm font-medium">{signatureStats.documentsRequiringSignature}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Completion Rate</span>
                  <span className="text-sm font-medium">{completionRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document List Tab */}
      {reportType === 'document-list' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Document List</h3>
            <p className="text-sm text-gray-600 mt-1">All documents from the last {dateRange} days</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Upload Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocuments.map((doc, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText className="w-5 h-5 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        doc.status === 'completed' ? 'bg-green-100 text-green-800' :
                        doc.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(doc.uploadDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {doc.signers.length} signers
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        doc.uploaded_by === userEmail ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {doc.uploaded_by === userEmail ? 'Uploaded' : 'To Sign'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredDocuments.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No documents found for the selected date range.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;