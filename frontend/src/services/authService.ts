import { User } from '../types';
import { API_ENDPOINTS, TOKEN_KEY } from '../config/api';

// Store current user in session storage
const CURRENT_USER_KEY = 'currentUser';

export const loginUser = async (username: string, password: string) => {
  const response = await fetch(API_ENDPOINTS.LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Login failed');
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
  return data.user as User;
};

export const logoutUser = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(CURRENT_USER_KEY);
  window.location.reload();
};

// The role shown here is only used for display; the server enforces permissions
export const getCurrentUser = (): User | null => {
  if (!sessionStorage.getItem(TOKEN_KEY)) return null;
  const storedUser = sessionStorage.getItem(CURRENT_USER_KEY);
  return storedUser ? JSON.parse(storedUser) : null;
};

export const isAuthenticated = (): boolean => getCurrentUser() !== null;

export const isAdmin = (): boolean => getCurrentUser()?.role === 'admin';
