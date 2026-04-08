import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
    data: deploymentReadiness,
    isError: isDeploymentReadinessError,
    error: deploymentReadinessError,
  } = useQuery({
    queryKey: ['admin-deployment-readiness'],
    queryFn: getDeploymentReadiness,
  });

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

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          {t('admin.orimSettings')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          {t('admin.settingsDescription')}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
          <Chip
            size="small"
            variant="outlined"
            label={`${t('admin.deploymentVersion')}: ${deploymentReadiness?.applicationVersion ?? '...'}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`${t('admin.deploymentEnvironment')}: ${deploymentReadiness?.environmentName ?? '...'}`}
          />
        </Stack>
        {isDeploymentReadinessError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(deploymentReadinessError, t('admin.deploymentReadinessLoadFailed'))}
          </Alert>
        )}
      </Box>

      <Accordion defaultExpanded={false} sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={600}>
              {t('admin.assistantManagement')}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip size="small" label={assistantSettings?.provider ?? 'Azure OpenAI'} variant="outlined" />
              <Chip size="small" color={assistantStatusColor} label={assistantStatusLabel} />
            </Stack>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="form" onSubmit={handleAssistantSave}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('admin.assistantManagementDescription')}
            </Typography>

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
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded={false}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" fontWeight={600}>
            {t('admin.themeManagement')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {themeMessage && (
            <Alert severity={themeMessage.severity} sx={{ mb: 2 }}>
              {themeMessage.text}
            </Alert>
          )}

          {isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(error, t('admin.themeLoadFailed'))}
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('admin.themeManagementDescription')}
            </Typography>
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {t('admin.themeUploadReplaceHint')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('admin.themeImmutableHint')}
          </Typography>

          <TableContainer component={Paper} variant="outlined">
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
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
