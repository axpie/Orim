import { create } from 'zustand';

interface DashboardPrefsState {
  showTemplates: boolean;
  showRecent: boolean;
  showSharedWithMe: boolean;
  setShowTemplates: (value: boolean) => void;
  setShowRecent: (value: boolean) => void;
  setShowSharedWithMe: (value: boolean) => void;
  hydrate: () => void;
}

function readBool(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : defaultValue;
}

export const useDashboardPrefsStore = create<DashboardPrefsState>((set) => ({
  showTemplates: true,
  showRecent: true,
  showSharedWithMe: true,

  setShowTemplates: (value) => {
    localStorage.setItem('orim_dashboard_show_templates', String(value));
    set({ showTemplates: value });
  },

  setShowRecent: (value) => {
    localStorage.setItem('orim_dashboard_show_recent', String(value));
    set({ showRecent: value });
  },

  setShowSharedWithMe: (value) => {
    localStorage.setItem('orim_dashboard_show_shared', String(value));
    set({ showSharedWithMe: value });
  },

  hydrate: () => {
    set({
      showTemplates: readBool('orim_dashboard_show_templates', true),
      showRecent: readBool('orim_dashboard_show_recent', true),
      showSharedWithMe: readBool('orim_dashboard_show_shared', true),
    });
  },
}));
