import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { StickyNotePreset } from '../../../types/models';
import { useBoardStore } from '../store/boardStore';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createBoardMetadataUpdatedOperation } from '../realtime/boardOperations';
import {
  createStickyNotePresetDraft,
  getDefaultStickyNotePresets,
  getEffectiveStickyNotePresets,
} from '../stickyNotePresets';

interface BoardSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
}

function sanitizeStickyNotePresets(presets: StickyNotePreset[]): StickyNotePreset[] {
  return presets.map((preset) => ({
    ...preset,
    label: preset.label.trim(),
    fillColor: preset.fillColor,
  }));
}

export function BoardSettingsDialog({ open, onClose, onBoardChanged }: BoardSettingsDialogProps) {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const [draftPresets, setDraftPresets] = useState<StickyNotePreset[]>([]);

  useEffect(() => {
    if (!open || !board) {
      return;
    }

    setDraftPresets(getEffectiveStickyNotePresets(board, t));
  }, [board, open, t]);

  const validationMessage = useMemo(() => {
    if (draftPresets.length === 0) {
      return t('boardSettings.atLeastOnePreset');
    }

    if (draftPresets.some((preset) => preset.label.trim().length === 0)) {
      return t('boardSettings.presetLabelRequired');
    }

    return null;
  }, [draftPresets, t]);

  if (!board) {
    return null;
  }

  const handlePresetChange = (presetId: string, changes: Partial<StickyNotePreset>) => {
    setDraftPresets((current) => current.map((preset) => (
      preset.id === presetId
        ? { ...preset, ...changes }
        : preset
    )));
  };

  const handleRemovePreset = (presetId: string) => {
    setDraftPresets((current) => current.filter((preset) => preset.id !== presetId));
  };

  const handleAddPreset = () => {
    setDraftPresets((current) => [...current, createStickyNotePresetDraft(current.length, t)]);
  };

  const handleRestoreDefaults = () => {
    setDraftPresets(getDefaultStickyNotePresets(t));
  };

  const handleSave = () => {
    if (validationMessage) {
      return;
    }

    const stickyNotePresets = sanitizeStickyNotePresets(draftPresets);
    updateBoard({ stickyNotePresets });
    onBoardChanged?.('Metadata', createBoardMetadataUpdatedOperation({
      title: board.title,
      labelOutlineEnabled: board.labelOutlineEnabled,
      arrowOutlineEnabled: board.arrowOutlineEnabled,
      customColors: board.customColors,
      recentColors: board.recentColors,
      stickyNotePresets,
    }));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('boardSettings.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('boardSettings.stickyPresets')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('boardSettings.description')}
            </Typography>
          </Box>

          {validationMessage && (
            <Alert severity="warning">
              {validationMessage}
            </Alert>
          )}

          {draftPresets.map((preset, index) => (
            <Box
              key={preset.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '88px 1fr auto',
                gap: 1.5,
                alignItems: 'end',
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t('boardSettings.presetColor')}
                </Typography>
                <TextField
                  type="color"
                  size="small"
                  value={preset.fillColor}
                  onChange={(event) => handlePresetChange(preset.id, { fillColor: event.target.value })}
                  inputProps={{ 'aria-label': `${t('boardSettings.presetColor')} ${index + 1}` }}
                  InputProps={{ sx: { px: 0.5 } }}
                  fullWidth
                />
              </Box>
              <TextField
                label={t('boardSettings.presetLabel')}
                size="small"
                value={preset.label}
                onChange={(event) => handlePresetChange(preset.id, { label: event.target.value })}
              />
              <IconButton
                aria-label={t('boardSettings.removePreset')}
                onClick={() => handleRemovePreset(preset.id)}
                disabled={draftPresets.length === 1}
                sx={{ mb: 0.25 }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddPreset}>
              {t('boardSettings.addPreset')}
            </Button>
            <Button variant="text" startIcon={<RestartAltIcon />} onClick={handleRestoreDefaults}>
              {t('boardSettings.restoreDefaults')}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={validationMessage != null}>
          {t('common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
