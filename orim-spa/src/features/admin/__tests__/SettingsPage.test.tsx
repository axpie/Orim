import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantAdminSettings, DeploymentReadiness } from '../../../types/models';
import { SettingsPage } from '../SettingsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../api/admin', () => ({
  getDeploymentReadiness: vi.fn(),
}));

vi.mock('../../../api/assistantSettings', () => ({
  getAssistantSettings: vi.fn(),
  updateAssistantSettings: vi.fn(),
}));

vi.mock('../../../api/themes', () => ({
  deleteTheme: vi.fn(),
  downloadThemeJson: vi.fn(),
  getAdminThemes: vi.fn(),
  setThemeEnabled: vi.fn(),
  uploadTheme: vi.fn(),
}));

import { getDeploymentReadiness } from '../../../api/admin';
import { getAssistantSettings } from '../../../api/assistantSettings';
import { getAdminThemes } from '../../../api/themes';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

const deploymentReadiness: DeploymentReadiness = {
  environmentName: 'Production',
  applicationVersion: 'v1.2.3',
  databaseProvider: 'Npgsql.EntityFrameworkCore.PostgreSQL',
  isRelationalDatabase: true,
  databaseConnected: true,
  pendingMigrationCount: 0,
  httpsRedirectionEnabled: true,
  hstsEnabled: true,
  requestIdHeaderEnabled: true,
  rateLimitingEnabled: true,
  cookieAuthEnabled: true,
  microsoftSsoConfigured: true,
  googleSsoConfigured: false,
  assistantEnabled: true,
  assistantConfigured: true,
  enabledThemeCount: 1,
  totalThemeCount: 1,
  healthEndpoints: ['/health/live', '/health/ready'],
};

const assistantSettings: AssistantAdminSettings = {
  enabled: true,
  endpoint: 'https://example.openai.azure.com',
  deploymentName: 'gpt-4.1',
  hasApiKey: true,
  isConfigured: true,
  provider: 'Azure OpenAI',
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDeploymentReadiness).mockResolvedValue(deploymentReadiness);
    vi.mocked(getAssistantSettings).mockResolvedValue(assistantSettings);
    vi.mocked(getAdminThemes).mockResolvedValue([]);
  });

  it('shows the deployment version and environment in the settings header', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('admin.deploymentVersion: v1.2.3')).toBeInTheDocument();
    expect(await screen.findByText('admin.deploymentEnvironment: Production')).toBeInTheDocument();
  });
});
