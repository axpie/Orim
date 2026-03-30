import { create } from 'zustand';
import type { LoginResponse, UserRole } from '../types/models';
import { exchangeGoogleIdToken, exchangeMicrosoftIdToken, login as apiLogin } from '../api/auth';

interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithMicrosoft: (idToken: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  setSession: (response: LoginResponse) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
}

let storageSyncInitialized = false;

function toAuthUser(response: { userId: string; username: string; displayName: string; role: UserRole }): AuthUser {
  const normalizedDisplayName = response.displayName.trim().length > 0 ? response.displayName : response.username;

  return {
    id: response.userId,
    username: response.username,
    displayName: normalizedDisplayName,
    role: response.role,
  };
}

function persistUser(user: AuthUser) {
  localStorage.setItem('orim_user', JSON.stringify(user));
}

function persistAuth(response: LoginResponse) {
  const user = toAuthUser(response);

  localStorage.setItem('orim_token', response.token);
  persistUser(user);

  return { user, token: response.token, isAuthenticated: true } satisfies Pick<AuthState, 'user' | 'token' | 'isAuthenticated'>;
}

function clearPersistedAuth() {
  localStorage.removeItem('orim_token');
  localStorage.removeItem('orim_user');
}

function parsePersistedUser(userJson: string): AuthUser {
  const parsedUser = JSON.parse(userJson) as Partial<AuthUser>;
  if (!parsedUser.id || !parsedUser.username || !parsedUser.role) {
    throw new Error('Invalid stored user.');
  }

  return {
    id: parsedUser.id,
    username: parsedUser.username,
    displayName: parsedUser.displayName?.trim().length ? parsedUser.displayName : parsedUser.username,
    role: parsedUser.role,
  };
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

  setSession: (response) => {
    set(persistAuth(response));
  },

  setUser: (user) => {
    persistUser(user);
    set((state) => ({ ...state, user }));
  },

  logout: () => {
    clearPersistedAuth();
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    const syncFromStorage = () => {
      const token = localStorage.getItem('orim_token');
      const userJson = localStorage.getItem('orim_user');

      if (token && userJson) {
        try {
          const user = parsePersistedUser(userJson);
          const normalizedUserJson = JSON.stringify(user);
          if (normalizedUserJson !== userJson) {
            localStorage.setItem('orim_user', normalizedUserJson);
          }
          set({ user, token, isAuthenticated: true });
          return;
        } catch {
          clearPersistedAuth();
        }
      }

      set({ user: null, token: null, isAuthenticated: false });
    };

    syncFromStorage();

    if (!storageSyncInitialized && typeof window !== 'undefined') {
      storageSyncInitialized = true;
      window.addEventListener('storage', (event) => {
        if (event.key === null || event.key === 'orim_token' || event.key === 'orim_user') {
          syncFromStorage();
        }
      });
    }
  },
}));
