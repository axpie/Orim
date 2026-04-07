import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { getThemes } from '../../api/themes';
import { exportUserZip } from '../../api/boards';
import { useThemeStore } from '../../stores/themeStore';
import { useDashboardPrefsStore } from '../../stores/dashboardPrefsStore';

interface AppSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function normalizeLanguage(value: string): 'de' | 'en' {
  return value.toLowerCase().startsWith('en') ? 'en' : 'de';
}

export function AppSettingsDialog({ open, onClose }: AppSettingsDialogProps) {
  if (!open) {
    return null;
  }

  return <OpenAppSettingsDialog onClose={onClose} />;
}

function OpenAppSettingsDialog({ onClose }: Pick<AppSettingsDialogProps, 'onClose'>) {
  const { t, i18n } = useTranslation();
  const themeKey = useThemeStore((s) => s.themeKey);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });

  const prefs = useDashboardPrefsStore();
  const [draftLanguage, setDraftLanguage] = useState<'de' | 'en'>(normalizeLanguage(i18n.language));
  const [draftThemeKey, setDraftThemeKey] = useState(themeKey);
  const [draftShowTemplates, setDraftShowTemplates] = useState(prefs.showTemplates);
  const [draftShowRecent, setDraftShowRecent] = useState(prefs.showRecent);
  const [draftShowSharedWithMe, setDraftShowSharedWithMe] = useState(prefs.showSharedWithMe);
  const [exportLoading, setExportLoading] = useState(false);

  const handleExportZip = async () => {
    setExportLoading(true);
    try {
      const blob = await exportUserZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orim-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  const handleSave = async () => {
    if (draftThemeKey && draftThemeKey !== themeKey) {
      setTheme(draftThemeKey);
    }

    const currentLanguage = normalizeLanguage(i18n.language);
    if (draftLanguage !== currentLanguage) {
      await i18n.changeLanguage(draftLanguage);
    }

    prefs.setShowTemplates(draftShowTemplates);
    prefs.setShowRecent(draftShowRecent);
    prefs.setShowSharedWithMe(draftShowSharedWithMe);

    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('app.settings')}</DialogTitle>
      <DialogContent>
        <TextField
          select
          fullWidth
          label={t('app.language')}
          value={draftLanguage}
          onChange={(e) => setDraftLanguage(e.target.value as 'de' | 'en')}
          sx={{ mt: 1, mb: 2 }}
        >
          <MenuItem value="de">Deutsch</MenuItem>
          <MenuItem value="en">English</MenuItem>
        </TextField>

        <TextField
          select
          fullWidth
          label={t('app.theme')}
          value={draftThemeKey}
          onChange={(e) => setDraftThemeKey(e.target.value)}
          disabled={themes.length === 0}
          sx={{ mb: 2 }}
        >
          {themes.length > 0 ? themes.map((theme) => (
            <MenuItem key={theme.key} value={theme.key}>
              {theme.name}
            </MenuItem>
          )) : (
            <MenuItem value={draftThemeKey}>{draftThemeKey}</MenuItem>
          )}
        </TextField>

        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {t('app.dashboardSections')}
        </Typography>

        <FormControlLabel
          control={<Switch checked={draftShowTemplates} onChange={(e) => setDraftShowTemplates(e.target.checked)} />}
          label={t('dashboard.templates')}
        />
        <br />
        <FormControlLabel
          control={<Switch checked={draftShowRecent} onChange={(e) => setDraftShowRecent(e.target.checked)} />}
          label={t('dashboard.recentBoards')}
        />
        <br />
        <FormControlLabel
          control={<Switch checked={draftShowSharedWithMe} onChange={(e) => setDraftShowSharedWithMe(e.target.checked)} />}
          label={t('dashboard.sharedWithMe')}
        />

        <Divider sx={{ mt: 2, mb: 1.5 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          {t('app.dataExport')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('app.dataExportDescription')}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={() => void handleExportZip()}
          disabled={exportLoading}
          fullWidth
          size="small"
        >
          {exportLoading ? t('app.dataExportLoading') : t('app.dataExportButton')}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave}>
          {t('board.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
