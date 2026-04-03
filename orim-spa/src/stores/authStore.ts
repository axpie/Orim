import { create } from 'zustand';
import type { LoginResponse, UserRole } from '../types/models';
import {
  exchangeGoogleIdToken,
  exchangeMicrosoftIdToken,
  login as apiLogin,
  logout as apiLogout,
  refreshToken,
} from '../api/auth';

interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithMicrosoft: (idToken: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  setSession: (response: LoginResponse) => void;
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
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

  persistUser(user);

  return { user, isAuthenticated: true } satisfies Pick<AuthState, 'user' | 'isAuthenticated'>;
}

function clearPersistedAuth() {
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
  isAuthenticated: false,
  isHydrating: true,

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

  logout: async () => {
    try {
      await apiLogout();
    } finally {
      clearPersistedAuth();
      set({ user: null, isAuthenticated: false, isHydrating: false });
    }
  },

  hydrate: async () => {
    const syncFromStorage = async () => {
      const userJson = localStorage.getItem('orim_user');

      if (userJson) {
        try {
          const user = parsePersistedUser(userJson);
          const normalizedUserJson = JSON.stringify(user);
          if (normalizedUserJson !== userJson) {
            localStorage.setItem('orim_user', normalizedUserJson);
          }
          set({ user, isAuthenticated: true, isHydrating: true });
          const refreshed = await refreshToken();
          set({ ...persistAuth(refreshed), isHydrating: false });
          return;
        } catch {
          clearPersistedAuth();
        }
      }

      set({ user: null, isAuthenticated: false, isHydrating: false });
    };

    await syncFromStorage();

    if (!storageSyncInitialized && typeof window !== 'undefined') {
      storageSyncInitialized = true;
      window.addEventListener('storage', (event) => {
        if (event.key === null || event.key === 'orim_user') {
          void syncFromStorage();
        }
      });
    }
  },
}));
