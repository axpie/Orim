import { create } from 'zustand';
import type { UserRole } from '../types/models';
import { login as apiLogin } from '../api/auth';

interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (username, password) => {
    const response = await apiLogin(username, password);
    const user: AuthUser = {
      id: response.userId,
      username: response.username,
      role: response.role,
    };
    localStorage.setItem('orim_token', response.token);
    localStorage.setItem('orim_user', JSON.stringify(user));
    set({ user, token: response.token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('orim_token');
    localStorage.removeItem('orim_user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = localStorage.getItem('orim_token');
    const userJson = localStorage.getItem('orim_user');
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem('orim_token');
        localStorage.removeItem('orim_user');
      }
    }
  },
}));
