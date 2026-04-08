import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeDefinition } from '../../../types/models';
import { AppSettingsDialog } from '../AppSettingsDialog';
import { getThemes } from '../../../api/themes';
import { useDashboardPrefsStore } from '../../../stores/dashboardPrefsStore';
import { useThemeStore } from '../../../stores/themeStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'de',
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock('../../../api/themes', () => ({
  getThemes: vi.fn(),
}));

vi.mock('../../../api/boards', () => ({
  exportUserZip: vi.fn(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createTheme(): ThemeDefinition {
  return {
    key: 'light',
    name: 'Light',
    isDarkMode: false,
    isEnabled: true,
    fontFamily: ['Inter'],
    palette: {
      primary: '#112233',
      secondary: '#223344',
      tertiary: '#334455',
      appbarBackground: '#445566',
      appbarText: '#ffffff',
      background: '#f8fafc',
      surface: '#ffffff',
      drawerBackground: '#0f172a',
      drawerText: '#f8fafc',
      drawerIcon: '#f8fafc',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      linesDefault: '#cbd5e1',
    },
    boardDefaults: {
      surfaceColor: '#ffffff',
      gridColor: '#e2e8f0',
      shapeFillColor: '#ffffff',
      strokeColor: '#0f172a',
      iconColor: '#0f172a',
      selectionColor: '#2563eb',
      selectionTintRgb: '37, 99, 235',
      handleSurfaceColor: '#ffffff',
      dockTargetColor: '#0f766e',
      themeColors: [],
    },
  };
}

describe('AppSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useThemeStore.setState({ themeKey: 'light' });
    useDashboardPrefsStore.setState({
      showTemplates: true,
      showRecent: true,
      showSharedWithMe: true,
    });
    vi.mocked(getThemes).mockResolvedValue([createTheme()]);
  });

  it('shows account-specific settings in full mode', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AppSettingsDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText('app.language')).toBeInTheDocument();
    expect(screen.getByLabelText('app.theme')).toBeInTheDocument();
    expect(screen.getByText('app.dashboardSections')).toBeInTheDocument();
    expect(screen.getByText('app.dataExport')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'app.dataExportButton' })).toBeInTheDocument();
  });

  it('limits anonymous users to language and theme settings', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AppSettingsDialog open onClose={() => {}} scope="appearance-only" />
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText('app.language')).toBeInTheDocument();
    expect(screen.getByLabelText('app.theme')).toBeInTheDocument();
    expect(screen.queryByText('app.dashboardSections')).not.toBeInTheDocument();
    expect(screen.queryByText('app.dataExport')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'app.dataExportButton' })).not.toBeInTheDocument();
  });
});
