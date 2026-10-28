import React, { useState } from 'react';
import { PenTool, Shield, Mail, Users, CheckCircle, ArrowRight, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { loginUser } from '../services/authService';
import { useBranding } from '../services/brandingService';
import ThemeToggle from './ThemeToggle';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

type Mode = 'ad' | 'admin';
const MODE_KEY = 'signflow.loginMode';

const features = [
  { icon: PenTool, title: 'Digital Signatures', description: 'Create and manage electronic signatures with a full audit trail' },
  { icon: Shield, title: 'Enterprise Security', description: 'Active Directory sign-in with server-enforced permissions' },
  { icon: Mail, title: 'Email Integration', description: 'Each signer is notified automatically when it is their turn' },
  { icon: Users, title: 'Multi-party Signing', description: 'Route documents to several signers in a fixed order' },
];

const initialMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'admin' ? 'admin' : 'ad';
  } catch {
    return 'ad';
  }
};

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<Mode>(initialMode);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const branding = useBranding();

  const switchMode = (mode: Mode) => {
    setLoginMode(mode);
    setError(null);
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* not persisted */ }
  };

  // Both tabs sign in through the server; it decides which accounts are admins
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await loginUser(credentials.username.trim(), credentials.password);
      onLoginSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /too many/i.test(message)
          ? message
          : loginMode === 'ad'
            ? 'Active Directory login failed. Please check your username and password.'
            : 'Invalid admin credentials. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Brand panel (wide screens) */}
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 text-white">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" aria-hidden="true" />
        <div className="absolute bottom-[-8rem] right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <PenTool className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight">{branding.displayName}</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
              Get documents signed, in the right order.
            </h1>
            <p className="mt-4 text-lg text-blue-100/90">
              Upload, route and sign agreements securely, with every step recorded.
            </p>
            <ul className="mt-10 space-y-6">
              {features.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start space-x-4">
                  <span className="flex-none w-10 h-10 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-white" />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-blue-100/80">{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-blue-100/70">
            {branding.logoUrl ? `Powered by ${branding.appName}` : 'Self-hosted electronic signatures'}
          </p>
        </div>
      </aside>

      {/* Sign-in */}
      <main className="flex-1 flex flex-col">
        <div className="flex justify-end p-4 sm:p-6">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl px-6 sm:px-10 py-10">
            {branding.logoUrl ? (
              <div className="flex justify-center mb-6">
                {/* White plate keeps customer logos legible in dark mode */}
                <div className="rounded-xl bg-white px-4 py-2">
                  <img src={branding.logoUrl} alt={`${branding.displayName} logo`} className="h-20 w-auto max-w-full object-contain" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
                  <PenTool className="w-8 h-8 text-white" />
                </div>
                <span className="mt-3 text-xl font-bold text-gray-900">{branding.displayName}</span>
              </div>
            )}

            <h2 className="text-2xl font-bold text-gray-900 text-center">Welcome Back</h2>
            <p className="text-sm text-gray-500 text-center mt-1 mb-6">Sign in to continue to {branding.displayName}</p>

            {/* Login Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 mb-6" role="tablist" aria-label="Sign-in method">
              {([
                { mode: 'ad' as const, icon: Shield, label: 'Active Directory' },
                { mode: 'admin' as const, icon: User, label: 'Admin' },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={loginMode === mode}
                  onClick={() => switchMode(mode)}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2 px-2 sm:px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    loginMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-6 flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <AlertCircle className="w-5 h-5 text-red-600 flex-none mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  {loginMode === 'ad' ? 'Username' : 'Admin username or email'}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={credentials.username}
                    onChange={(e) => setCredentials((prev) => ({ ...prev, username: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={loginMode === 'ad' ? 'e.g. jdoe' : 'e.g. admin@yourcompany.com'}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={credentials.password}
                    onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))}
                    onKeyUp={checkCaps}
                    onKeyDown={checkCaps}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 rounded-md"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {capsLock && <p className="mt-2 text-xs text-yellow-600">Caps Lock is on</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading || !credentials.username || !credentials.password}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center space-x-3 group"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    {loginMode === 'ad' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    <span>{loginMode === 'ad' ? 'Sign in with Active Directory' : 'Sign in as Admin'}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center mb-4">Secure authentication powered by:</p>
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
              {branding.logoUrl && (
                <p className="mt-4 text-xs text-gray-400 text-center lg:hidden">Powered by {branding.appName}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
