import { create } from 'zustand';
import type { UserRole } from '../types/models';
import { exchangeGoogleIdToken, exchangeMicrosoftIdToken, login as apiLogin } from '../api/auth';

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
  loginWithMicrosoft: (idToken: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

function toAuthUser(response: { userId: string; username: string; role: UserRole }): AuthUser {
  return {
    id: response.userId,
    username: response.username,
    role: response.role,
  };
}

function persistAuth(response: { token: string; userId: string; username: string; role: UserRole }) {
  const user = toAuthUser(response);

  localStorage.setItem('orim_token', response.token);
  localStorage.setItem('orim_user', JSON.stringify(user));

  return { user, token: response.token, isAuthenticated: true } satisfies Pick<AuthState, 'user' | 'token' | 'isAuthenticated'>;
}

function clearPersistedAuth() {
  localStorage.removeItem('orim_token');
  localStorage.removeItem('orim_user');
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (username, password) => {
    const response = await apiLogin(username, password);
    set(persistAuth(response));
  },

  loginWithMicrosoft: async (idToken) => {
    const response = await exchangeMicrosoftIdToken(idToken);
    set(persistAuth(response));
  },

  loginWithGoogle: async (idToken) => {
    const response = await exchangeGoogleIdToken(idToken);
    set(persistAuth(response));
  },

  logout: () => {
    clearPersistedAuth();
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
        clearPersistedAuth();
      }
    }
  },
}));
