import React from 'react';
import { FileText, PenTool, Upload, Home, User, BarChart3, Settings } from 'lucide-react';
import { getCurrentUser, isAdmin } from '../services/authService';
import { useBranding } from '../services/brandingService';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: 'dashboard' | 'upload' | 'signature' | 'viewer' | 'reports' | 'admin') => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onNavigate }) => {
  const currentUser = getCurrentUser();
  const userIsAdmin = isAdmin();
  const branding = useBranding();

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={`${branding.displayName} logo`} className="h-10 w-auto max-w-[160px] object-contain mr-2" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center mr-1">
                  <PenTool className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-xl font-bold text-gray-900">{branding.displayName}</span>
              {userIsAdmin && (
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                  Admin
                </span>
              )}
            </div>
            
            <nav className="hidden md:flex space-x-6">
              <button
                onClick={() => onNavigate('dashboard')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
              
              <button
                onClick={() => onNavigate('upload')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'upload'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Upload</span>
              </button>
              
              <button
                onClick={() => onNavigate('signature')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'signature'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <PenTool className="w-4 h-4" />
                <span>Signatures</span>
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'reports'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Reports</span>
              </button>

              {userIsAdmin && (
                <button
                  onClick={() => onNavigate('admin')}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'admin'
                      ? 'bg-red-50 text-red-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              )}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                userIsAdmin ? 'bg-red-100' : 'bg-blue-100'
              }`}>
                {currentUser?.name ? (
                  <span className={`text-sm font-medium ${
                    userIsAdmin ? 'text-red-700' : 'text-blue-700'
                  }`}>
                    {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                ) : (
                  <User className={`w-4 h-4 ${userIsAdmin ? 'text-red-700' : 'text-blue-700'}`} />
                )}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {currentUser?.name || currentUser?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500">
                  {userIsAdmin ? 'Administrator' : 'User'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;