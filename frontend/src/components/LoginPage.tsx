import React, { useState } from 'react';
import { PenTool, Shield, CheckCircle, ArrowRight, User, Lock } from 'lucide-react';
import { loginUser } from '../services/authService';
import { APP_NAME } from '../config/api';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'ad' | 'admin'>('ad');
  const [adminCredentials, setAdminCredentials] = useState({
    username: '',
    password: ''
  });
  const [adCredentials, setAdCredentials] = useState({ username: '', password: '' });

  // Both tabs sign in through the server; it decides which accounts are admins
  const signIn = async (username: string, password: string, failureMessage: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await loginUser(username, password);
      onLoginSuccess();
    } catch {
      setError(failureMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleADLogin = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(adCredentials.username, adCredentials.password,
      'Active Directory login failed. Please check your credentials and try again.');
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(adminCredentials.username, adminCredentials.password,
      'Invalid admin credentials. Please try again.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md flex flex-col justify-center px-8 py-12 bg-white shadow-lg z-10">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
            <PenTool className="w-10 h-10 text-white" />
          </div>
          <span className="mt-3 text-2xl font-bold text-gray-900">{APP_NAME}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Welcome Back</h2>

        {/* Login Mode Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setLoginMode('ad')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
              loginMode === 'ad'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Active Directory</span>
          </button>
          <button
            onClick={() => setLoginMode('admin')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
              loginMode === 'admin'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Admin</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {loginMode === 'ad' ? (
          <form onSubmit={handleADLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-gray-700 font-medium mb-1">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={adCredentials.username}
                onChange={e => setAdCredentials({ ...adCredentials, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-gray-700 font-medium mb-1">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={adCredentials.password}
                onChange={e => setAdCredentials({ ...adCredentials, password: e.target.value })}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center space-x-3 group"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  <span>Sign in with Active Directory</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={adminCredentials.username}
                  onChange={(e) => setAdminCredentials(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter admin username"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={adminCredentials.password}
                  onChange={(e) => setAdminCredentials(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter admin password"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !adminCredentials.username || !adminCredentials.password}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center space-x-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <User className="w-5 h-5" />
                  <span>Sign in as Admin</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">Secure authentication powered by:</p>
            <div className="flex items-center justify-center space-x-6 text-gray-400">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4" />
                <span className="text-xs">Active Directory</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs">SSO Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
