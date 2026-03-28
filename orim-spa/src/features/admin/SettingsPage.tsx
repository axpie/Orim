import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  deleteTheme,
  downloadThemeJson,
  getAdminThemes,
  setThemeEnabled,
  uploadTheme,
} from '../../api/themes';
import { useThemeStore } from '../../stores/themeStore';
import type { ThemeDefinition } from '../../types/models';

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
  const [message, setMessage] = useState<MessageState>(null);

  const { data: themes = [], isLoading, isError, error } = useQuery({
    queryKey: ['admin-themes'],
    queryFn: getAdminThemes,
  });

  const invalidateThemes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-themes'] });
    await queryClient.invalidateQueries({ queryKey: ['themes'] });
  };

  const uploadMutation = useMutation({
    mutationFn: uploadTheme,
    onSuccess: async () => {
      await invalidateThemes();
      setMessage({ severity: 'success', text: t('admin.themeUploaded') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeUploadFailed')) });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setThemeEnabled(key, enabled),
    onSuccess: async () => {
      await invalidateThemes();
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeUpdateFailed')) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTheme,
    onSuccess: async () => {
      await invalidateThemes();
      setMessage({ severity: 'success', text: t('admin.themeDeleted') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('admin.themeDeleteFailed')) });
    },
  });

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setMessage(null);
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

    setMessage(null);
    deleteMutation.mutate(theme.key);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t('admin.orimSettings')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
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

      {message && (
        <Alert severity={message.severity} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getErrorMessage(error, t('admin.themeLoadFailed'))}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle2">{t('admin.themeManagement')}</Typography>
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
                    disabled={Boolean(theme.isProtected) || toggleMutation.isPending}
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