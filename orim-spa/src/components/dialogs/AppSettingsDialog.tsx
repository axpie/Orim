import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import { getThemes } from '../../api/themes';
import { useThemeStore } from '../../stores/themeStore';

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

  const [draftLanguage, setDraftLanguage] = useState<'de' | 'en'>(normalizeLanguage(i18n.language));
  const [draftThemeKey, setDraftThemeKey] = useState(themeKey);

  const handleSave = async () => {
    if (draftThemeKey && draftThemeKey !== themeKey) {
      setTheme(draftThemeKey);
    }

    const currentLanguage = normalizeLanguage(i18n.language);
    if (draftLanguage !== currentLanguage) {
      await i18n.changeLanguage(draftLanguage);
    }

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
        >
          {themes.length > 0 ? themes.map((theme) => (
            <MenuItem key={theme.key} value={theme.key}>
              {theme.name}
            </MenuItem>
          )) : (
            <MenuItem value={draftThemeKey}>{draftThemeKey}</MenuItem>
          )}
        </TextField>
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
