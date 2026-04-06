import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { getDeploymentReadiness } from '../../api/admin';
import { getAssistantSettings, updateAssistantSettings } from '../../api/assistantSettings';
import {
  deleteTheme,
  downloadThemeJson,
  getAdminThemes,
  setThemeEnabled,
  uploadTheme,
} from '../../api/themes';
import { useThemeStore } from '../../stores/themeStore';
import type { AssistantSettingsUpdateRequest, ThemeDefinition } from '../../types/models';

type MessageState = {
  severity: 'success' | 'error';
  text: string;
} | null;

type DeploymentCheckStatus = 'ready' | 'action-required' | 'info';
type DeploymentCheckSeverity = 'required' | 'recommended';

type DeploymentCheck = {
  key: string;
  title: string;
  status: DeploymentCheckStatus;
  severity: DeploymentCheckSeverity;
  message: string;
};

function getDeploymentStatusColor(status: DeploymentCheckStatus): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'action-required':
      return 'warning';
    default:
      return 'default';
  }
}

function getDeploymentSeverityColor(severity: DeploymentCheckSeverity): 'error' | 'info' {
  return severity === 'required' ? 'error' : 'info';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: unknown };
      message?: string;
    };

    if (typeof candidate.response?.data === 'string' && candidate.response.data.trim().length > 0) {
      return candidate.response.data;
    }

    if (typeof candidate.response?.data === 'object' && candidate.response.data !== null) {
      const payload = candidate.response.data as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error;
      }
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return fallback;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const themeKey = useThemeStore((s) => s.themeKey);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [themeMessage, setThemeMessage] = useState<MessageState>(null);
  const [assistantMessage, setAssistantMessage] = useState<MessageState>(null);
  const [assistantFormDraft, setAssistantFormDraft] = useState<AssistantSettingsUpdateRequest | null>(null);

  const {
    data: assistantSettings,
    isLoading: isAssistantLoading,
    isError: isAssistantError,
    error: assistantError,
  } = useQuery({
    queryKey: ['admin-assistant-settings'],
    queryFn: getAssistantSettings,
  });

  const { data: themes = [], isLoading, isError, error } = useQuery({
    queryKey: ['admin-themes'],
    queryFn: getAdminThemes,
  });

  const {
    data: deploymentReadiness,
    isError: isDeploymentReadinessError,
    error: deploymentReadinessError,
  } = useQuery({
    queryKey: ['admin-deployment-readiness'],
    queryFn: getDeploymentReadiness,
  });

  const assistantForm = assistantFormDraft ?? {
    enabled: assistantSettings?.enabled ?? false,
    endpoint: assistantSettings?.endpoint ?? '',
    deploymentName: assistantSettings?.deploymentName ?? 'gpt-4.1',
    apiKey: '',
  };

  const invalidateThemes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-themes'] });
    await queryClient.invalidateQueries({ queryKey: ['themes'] });
  };

  const uploadMutation = useMutation({
    mutationFn: uploadTheme,
    onSuccess: async () => {
      await invalidateThemes();
      setThemeMessage({ severity: 'success', text: t('admin.themeUploaded') });
    },
    onError: (error) => {
      setThemeMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeUploadFailed')) });
    },
  });

  const assistantMutation = useMutation({
    mutationFn: updateAssistantSettings,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(['admin-assistant-settings'], nextSettings);
      setAssistantFormDraft(null);
      setAssistantMessage({ severity: 'success', text: t('admin.assistantSettingsSaved') });
    },
    onError: (error) => {
      setAssistantMessage({ severity: 'error', text: getErrorMessage(error, t('admin.assistantSettingsSaveFailed')) });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setThemeEnabled(key, enabled),
    onSuccess: async () => {
      await invalidateThemes();
    },
    onError: (error) => {
      setThemeMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeUpdateFailed')) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTheme,
    onSuccess: async () => {
      await invalidateThemes();
      setThemeMessage({ severity: 'success', text: t('admin.themeDeleted') });
    },
    onError: (error) => {
      setThemeMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeDeleteFailed')) });
    },
  });

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setThemeMessage(null);
    uploadMutation.mutate(file);
    event.target.value = '';
  };

  const handleDownload = async (theme: ThemeDefinition) => {
    const blob = await downloadThemeJson(theme.key);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${theme.key}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (theme: ThemeDefinition) => {
    if (!window.confirm(t('admin.themeDeleteConfirmation', { name: theme.name }))) {
      return;
    }

    setThemeMessage(null);
    deleteMutation.mutate(theme.key);
  };

  const handleAssistantSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAssistantMessage(null);
    assistantMutation.mutate(assistantForm);
  };

  const assistantHasApiKey = Boolean(assistantSettings?.hasApiKey) || (assistantForm.apiKey?.trim().length ?? 0) > 0;
  const assistantStatusLabel = assistantSettings?.isConfigured
    ? t('admin.assistantConfigured')
    : assistantForm.enabled
      ? t('admin.assistantNeedsConfiguration')
      : t('admin.assistantDisabled');
  const assistantStatusColor = assistantSettings?.isConfigured
    ? 'success'
    : assistantForm.enabled
      ? 'warning'
      : 'default';
  const deploymentChecks = useMemo<DeploymentCheck[]>(() => {
    if (!deploymentReadiness) {
      return [];
    }

    const configuredSsoProviders = Number(deploymentReadiness.microsoftSsoConfigured) + Number(deploymentReadiness.googleSsoConfigured);

    return [
      {
        key: 'database',
        title: t('admin.readinessDatabaseTitle'),
        severity: 'required',
        status: deploymentReadiness.databaseConnected ? 'ready' : 'action-required',
        message: deploymentReadiness.databaseConnected
          ? t('admin.readinessDatabaseReady', { provider: deploymentReadiness.databaseProvider })
          : t('admin.readinessDatabaseAttention', { provider: deploymentReadiness.databaseProvider }),
      },
      {
        key: 'migrations',
        title: t('admin.readinessMigrationsTitle'),
        severity: 'required',
        status: !deploymentReadiness.isRelationalDatabase
          ? 'info'
          : deploymentReadiness.pendingMigrationCount === 0
            ? 'ready'
            : 'action-required',
        message: !deploymentReadiness.isRelationalDatabase
          ? t('admin.readinessMigrationsNotApplicable')
          : deploymentReadiness.pendingMigrationCount === 0
            ? t('admin.readinessMigrationsReady')
            : t('admin.readinessMigrationsAttention', { count: deploymentReadiness.pendingMigrationCount }),
      },
      {
        key: 'transport',
        title: t('admin.readinessTransportTitle'),
        severity: 'required',
        status: deploymentReadiness.httpsRedirectionEnabled && deploymentReadiness.hstsEnabled ? 'ready' : 'action-required',
        message: deploymentReadiness.httpsRedirectionEnabled && deploymentReadiness.hstsEnabled
          ? t('admin.readinessTransportReady')
          : t('admin.readinessTransportAttention'),
      },
      {
        key: 'operations',
        title: t('admin.readinessOperationsTitle'),
        severity: 'required',
        status: deploymentReadiness.requestIdHeaderEnabled && deploymentReadiness.rateLimitingEnabled ? 'ready' : 'action-required',
        message: deploymentReadiness.requestIdHeaderEnabled && deploymentReadiness.rateLimitingEnabled
          ? t('admin.readinessOperationsReady', {
            liveEndpoint: deploymentReadiness.healthEndpoints[0] ?? '/health/live',
            readyEndpoint: deploymentReadiness.healthEndpoints[1] ?? '/health/ready',
          })
          : t('admin.readinessOperationsAttention'),
      },
      {
        key: 'auth',
        title: t('admin.readinessAuthTitle'),
        severity: 'required',
        status: deploymentReadiness.cookieAuthEnabled ? 'ready' : 'action-required',
        message: deploymentReadiness.cookieAuthEnabled
          ? t('admin.readinessAuthReady')
          : t('admin.readinessAuthAttention'),
      },
      {
        key: 'sso',
        title: t('admin.readinessSsoTitle'),
        severity: 'recommended',
        status: configuredSsoProviders > 0 ? 'ready' : 'action-required',
        message: configuredSsoProviders > 0
          ? t('admin.readinessSsoReady', { count: configuredSsoProviders })
          : t('admin.readinessSsoAttention'),
      },
      {
        key: 'assistant',
        title: t('admin.readinessAssistantTitle'),
        severity: 'recommended',
        status: !deploymentReadiness.assistantEnabled
          ? 'info'
          : deploymentReadiness.assistantConfigured
            ? 'ready'
            : 'action-required',
        message: !deploymentReadiness.assistantEnabled
          ? t('admin.readinessAssistantDisabled')
          : deploymentReadiness.assistantConfigured
            ? t('admin.readinessAssistantReady')
            : t('admin.readinessAssistantAttention'),
      },
      {
        key: 'themes',
        title: t('admin.readinessThemesTitle'),
        severity: 'recommended',
        status: deploymentReadiness.enabledThemeCount > 0 ? 'ready' : 'action-required',
        message: deploymentReadiness.enabledThemeCount > 0
          ? t('admin.readinessThemesReady', {
            enabled: deploymentReadiness.enabledThemeCount,
            total: deploymentReadiness.totalThemeCount,
          })
          : t('admin.readinessThemesAttention'),
      },
    ];
  }, [deploymentReadiness, t]);
  const deploymentHasRequiredAttention = deploymentChecks.some((check) => check.severity === 'required' && check.status !== 'ready');
  const deploymentOverviewColor = deploymentHasRequiredAttention ? 'warning' : 'success';
  const deploymentOverviewLabel = deploymentHasRequiredAttention
    ? t('admin.deploymentAttention')
    : t('admin.deploymentReady');

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t('admin.orimSettings')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            {t('admin.settingsDescription')}
          </Typography>
        </Box>
      </Box>

      {isDeploymentReadinessError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getErrorMessage(deploymentReadinessError, t('admin.deploymentReadinessLoadFailed'))}
        </Alert>
      )}

      {deploymentReadiness && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={600}>
                {t('admin.deploymentReadiness')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('admin.deploymentReadinessDescription')}
              </Typography>
            </Box>
            <Chip color={deploymentOverviewColor} label={deploymentOverviewLabel} />
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentEnvironment')}: ${deploymentReadiness.environmentName}`} />
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentVersion')}: ${deploymentReadiness.applicationVersion}`} />
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentModel')}: ${t('admin.deploymentModelValue')}`} />
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentAuthMode')}: ${t('admin.deploymentAuthModeValue')}`} />
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentDatabaseProvider')}: ${deploymentReadiness.databaseProvider}`} />
            <Chip size="small" variant="outlined" label={`${t('admin.deploymentHealthEndpoints')}: ${deploymentReadiness.healthEndpoints.join(' · ')}`} />
          </Stack>

          <Stack spacing={1.5}>
            {deploymentChecks.map((check) => (
              <Box
                key={check.key}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Typography variant="subtitle2">{check.title}</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip
                      size="small"
                      color={getDeploymentSeverityColor(check.severity)}
                      label={check.severity === 'required' ? t('admin.deploymentRequired') : t('admin.deploymentRecommended')}
                    />
                    <Chip
                      size="small"
                      color={getDeploymentStatusColor(check.status)}
                      label={check.status === 'ready'
                        ? t('admin.deploymentCheckReady')
                        : check.status === 'action-required'
                          ? t('admin.deploymentCheckActionRequired')
                          : t('admin.deploymentCheckInfo')}
                    />
                  </Stack>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {check.message}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper component="form" onSubmit={handleAssistantSave} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t('admin.assistantManagement')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('admin.assistantManagementDescription')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Chip label={assistantSettings?.provider ?? 'Azure OpenAI'} variant="outlined" />
            <Chip color={assistantStatusColor} label={assistantStatusLabel} />
          </Stack>
        </Box>

        {assistantMessage && (
          <Alert severity={assistantMessage.severity} sx={{ mb: 2 }}>
            {assistantMessage.text}
          </Alert>
        )}

        {isAssistantError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getErrorMessage(assistantError, t('admin.assistantSettingsLoadFailed'))}
          </Alert>
        )}

        <FormControlLabel
          control={(
            <Switch
              checked={assistantForm.enabled}
              onChange={(_, checked) => setAssistantFormDraft((current) => ({ ...(current ?? assistantForm), enabled: checked }))}
              disabled={isAssistantLoading || assistantMutation.isPending}
            />
          )}
          label={t('admin.assistantEnabled')}
          sx={{ mb: 2 }}
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          <TextField
            label={t('admin.assistantEndpoint')}
            value={assistantForm.endpoint}
            onChange={(event) => setAssistantFormDraft((current) => ({ ...(current ?? assistantForm), endpoint: event.target.value }))}
            disabled={isAssistantLoading || assistantMutation.isPending}
            fullWidth
          />
          <TextField
            label={t('admin.assistantDeploymentName')}
            value={assistantForm.deploymentName}
            onChange={(event) => setAssistantFormDraft((current) => ({ ...(current ?? assistantForm), deploymentName: event.target.value }))}
            disabled={isAssistantLoading || assistantMutation.isPending}
            fullWidth
          />
          <TextField
            label={t('admin.assistantApiKey')}
            type="password"
            value={assistantForm.apiKey ?? ''}
            onChange={(event) => setAssistantFormDraft((current) => ({ ...(current ?? assistantForm), apiKey: event.target.value }))}
            disabled={isAssistantLoading || assistantMutation.isPending}
            fullWidth
            sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {assistantHasApiKey ? t('admin.assistantApiKeyStoredHint') : t('admin.assistantApiKeyMissingHint')}
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={isAssistantLoading || assistantMutation.isPending}
          >
            {t('admin.assistantSave')}
          </Button>
        </Box>
      </Paper>

      {themeMessage && (
        <Alert severity={themeMessage.severity} sx={{ mb: 3 }}>
          {themeMessage.text}
        </Alert>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getErrorMessage(error, t('admin.themeLoadFailed'))}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" fontWeight={600}>{t('admin.themeManagement')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('admin.themeManagementDescription')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            component="label"
            disabled={uploadMutation.isPending}
          >
            {t('admin.uploadThemeJson')}
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={handleUploadChange}
            />
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('admin.themeUploadReplaceHint')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('admin.themeImmutableHint')}
        </Typography>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('admin.themeName')}</TableCell>
              <TableCell>{t('admin.themeKey')}</TableCell>
              <TableCell>{t('admin.themeMode')}</TableCell>
              <TableCell>{t('admin.themeAvailability')}</TableCell>
              <TableCell>{t('admin.themeProtection')}</TableCell>
              <TableCell align="right">{t('admin.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {themes.map((theme) => (
              <TableRow key={theme.key}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <span>{theme.name}</span>
                    {theme.key === themeKey && (
                      <Chip size="small" color="primary" label={t('admin.currentTheme')} />
                    )}
                  </Box>
                </TableCell>
                <TableCell>{theme.key}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={theme.isDarkMode ? t('app.darkMode') : t('app.lightMode')}
                    color={theme.isDarkMode ? 'secondary' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={theme.isEnabled}
                    onChange={(_, checked) => toggleMutation.mutate({ key: theme.key, enabled: checked })}
                    disabled={toggleMutation.isPending}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={theme.isProtected ? 'warning' : 'success'}
                    label={theme.isProtected ? t('admin.protected') : t('admin.editable')}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={t('admin.downloadThemeJson')}>
                    <IconButton size="small" onClick={() => void handleDownload(theme)}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {!theme.isProtected && (
                    <Tooltip title={t('admin.deleteTheme')}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(theme)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && themes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('admin.noThemes')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
