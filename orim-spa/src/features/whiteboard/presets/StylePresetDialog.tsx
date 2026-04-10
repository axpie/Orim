import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';
import type { BoardElement, StylePresetStyle, StylePresetType } from '../../../types/models';
import { useBoardStore } from '../store/boardStore';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createBoardMetadataUpdatedOperation } from '../realtime/boardOperations';
import { useWhiteboardColorPalette } from '../controls/useWhiteboardColorPalette';
import { FALLBACK_BOARD_DEFAULTS } from '../canvas/canvasUtils';
import { useStylePresetStore } from './stylePresetStore';
import {
  getStylePresetTypeForElement,
  getThemeDefaultStyleForPresetType,
} from './stylePresetUtils';

interface StylePresetDialogProps {
  open: boolean;
  onClose: () => void;
  elementType: StylePresetType | null;
  sourceElement?: BoardElement | null;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  onApplyPresetToSource?: (style: StylePresetStyle) => void;
}

type PendingConfirmation =
  | { kind: 'delete'; presetId: string; presetName: string }
  | { kind: 'update'; presetId: string; presetName: string };

function getStylePresetTypeLabel(type: StylePresetType, fallback: (key: string, defaultValue?: string) => string) {
  switch (type) {
    case 'shape':
      return fallback('tools.shapes', 'Formen');
    case 'text':
      return fallback('tools.text', 'Text');
    case 'sticky':
      return fallback('tools.stickyNote', 'Haftnotiz');
    case 'frame':
      return fallback('tools.frame', 'Frame');
    case 'icon':
      return fallback('tools.icon', 'Icon');
    case 'arrow':
      return fallback('tools.arrow', 'Pfeil');
    case 'drawing':
      return fallback('tools.drawing', 'Freihand');
  }
}

export function StylePresetDialog({
  open,
  onClose,
  elementType,
  sourceElement = null,
  onBoardChanged,
  onApplyPresetToSource,
}: StylePresetDialogProps) {
  const { t } = useTranslation();
  const board = useBoardStore((state) => state.board);
  const pendingStickyNotePresetId = useBoardStore((state) => state.pendingStickyNotePresetId);
  const { activeTheme } = useWhiteboardColorPalette();
  const presets = useStylePresetStore((state) => state.presets);
  const placementPreferences = useStylePresetStore((state) => state.placementPreferences);
  const createPresetFromElement = useStylePresetStore((state) => state.createPresetFromElement);
  const updatePresetFromElement = useStylePresetStore((state) => state.updatePresetFromElement);
  const renamePreset = useStylePresetStore((state) => state.renamePreset);
  const deletePreset = useStylePresetStore((state) => state.deletePreset);
  const setPlacementMode = useStylePresetStore((state) => state.setPlacementMode);
  const setDefaultPreset = useStylePresetStore((state) => state.setDefaultPreset);

  const filteredPresets = useMemo(
    () => elementType ? presets.filter((preset) => preset.type === elementType) : [],
    [elementType, presets],
  );
  const placementPreference = elementType ? placementPreferences[elementType] : null;
  const canUseSource = !!elementType && !!sourceElement && getStylePresetTypeForElement(sourceElement) === elementType;
  const rawBoardDefaults = activeTheme?.boardDefaults ?? FALLBACK_BOARD_DEFAULTS;
  const boardSurfaceColor = board?.surfaceColor ?? null;
  const boardDefaults = useMemo(
    () => (boardSurfaceColor ? { ...rawBoardDefaults, surfaceColor: boardSurfaceColor } : rawBoardDefaults),
    [boardSurfaceColor, rawBoardDefaults],
  );
  const [setAsDefaultOnCreate, setSetAsDefaultOnCreate] = useState(true);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  if (!open || !elementType || !placementPreference) {
    return null;
  }

  const typeLabel = getStylePresetTypeLabel(elementType, (key, defaultValue) => t(key, { defaultValue }));
  const nextPresetName = `${typeLabel} ${filteredPresets.length + 1}`;
  const themeDefaultStyle = getThemeDefaultStyleForPresetType(elementType, {
    boardDefaults,
    board,
    pendingStickyNotePresetId,
  });

  const clearDraftName = (presetId: string) => {
    setDraftNames((current) => {
      if (!(presetId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[presetId];
      return next;
    });
  };

  const resetState = () => {
    setDraftNames({});
    setSetAsDefaultOnCreate(true);
    setEditingPresetId(null);
    setPendingConfirmation(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const emitPresetMetadataChange = () => {
    const currentBoard = useBoardStore.getState().board;
    if (!currentBoard) {
      return;
    }

    onBoardChanged?.('Metadata', createBoardMetadataUpdatedOperation(currentBoard));
  };

  const handleCreatePreset = () => {
    if (!sourceElement) {
      return;
    }

    const preset = createPresetFromElement(sourceElement, nextPresetName);
    if (!preset) {
      return;
    }

    if (setAsDefaultOnCreate) {
      setDefaultPreset(elementType, preset.id);
    }

    emitPresetMetadataChange();
  };

  const startRename = (presetId: string, currentName: string) => {
    setDraftNames((current) => ({
      ...current,
      [presetId]: current[presetId] ?? currentName,
    }));
    setEditingPresetId(presetId);
  };

  const commitRename = (presetId: string) => {
    const currentPreset = filteredPresets.find((preset) => preset.id === presetId);
    const nextName = draftNames[presetId]?.trim();

    setEditingPresetId((current) => current === presetId ? null : current);

    if (!currentPreset || !nextName || nextName === currentPreset.name) {
      clearDraftName(presetId);
      return;
    }

    renamePreset(presetId, nextName);
    clearDraftName(presetId);
    emitPresetMetadataChange();
  };

  const cancelRename = (presetId: string) => {
    clearDraftName(presetId);
    setEditingPresetId((current) => current === presetId ? null : current);
  };

  const handleConfirmedAction = () => {
    if (!pendingConfirmation) {
      return;
    }

    if (pendingConfirmation.kind === 'delete') {
      clearDraftName(pendingConfirmation.presetId);
      deletePreset(pendingConfirmation.presetId);
      emitPresetMetadataChange();
      setPendingConfirmation(null);
      return;
    }

    if (!sourceElement) {
      setPendingConfirmation(null);
      return;
    }

    updatePresetFromElement(pendingConfirmation.presetId, sourceElement);
    emitPresetMetadataChange();
    setPendingConfirmation(null);
  };

  const handleApplyPreset = (style: StylePresetStyle) => {
    onApplyPresetToSource?.(style);
    handleClose();
  };

  const showElementActions = canUseSource && !!sourceElement;
  const themeDefaultSelected = placementPreference.mode === 'theme-default';

  return (
    <>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>
          {t('stylePresets.dialogTitle', {
            type: typeLabel,
            defaultValue: 'Formatvorlagen für {{type}}',
          })}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('stylePresets.savedPresets', 'Presets')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Paper variant="outlined" sx={{ p: 1.25 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                      size="small"
                      value={t('stylePresets.themeDefault', 'Theme-Standard')}
                      sx={{ flex: '1 1 220px' }}
                      InputProps={{ readOnly: true }}
                    />
                    <Button
                      variant={themeDefaultSelected ? 'contained' : 'outlined'}
                      onClick={() => {
                        setPlacementMode(elementType, 'theme-default');
                        emitPresetMetadataChange();
                      }}
                    >
                      {themeDefaultSelected
                        ? t('stylePresets.defaultPreset', 'Standard-Preset')
                        : t('stylePresets.setAsDefault', 'Als Standard')}
                    </Button>
                    {showElementActions && onApplyPresetToSource && (
                      <Button
                        variant="text"
                        onClick={() => handleApplyPreset(themeDefaultStyle)}
                      >
                        {t('stylePresets.applyToCurrentElement', 'Für aktuelles Element übernehmen')}
                      </Button>
                    )}
                    {showElementActions && (
                      <Button variant="text" disabled>
                        {t('stylePresets.deriveFromCurrentElement', 'Aus aktuellem Element ableiten')}
                      </Button>
                    )}
                  </Box>
                </Paper>

                {filteredPresets.map((preset) => {
                  const isDefaultPreset = placementPreference.mode === 'preset' && placementPreference.presetId === preset.id;
                  const isEditing = editingPresetId === preset.id;

                  return (
                    <Paper key={preset.id} variant="outlined" sx={{ p: 1.25 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField
                          size="small"
                          value={draftNames[preset.id] ?? preset.name}
                          onChange={(event) => setDraftNames((current) => ({ ...current, [preset.id]: event.target.value }))}
                          onBlur={() => {
                            if (isEditing) {
                              commitRename(preset.id);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitRename(preset.id);
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelRename(preset.id);
                            }
                          }}
                          sx={{ flex: '1 1 220px' }}
                          InputProps={{
                            readOnly: !isEditing,
                            endAdornment: (
                              <InputAdornment position="end">
                                <Tooltip title={t('stylePresets.renamePreset', 'Preset umbenennen')} arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => startRename(preset.id, preset.name)}
                                    aria-label={t('stylePresets.renamePreset', 'Preset umbenennen')}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </InputAdornment>
                            ),
                          }}
                        />
                        <Button
                          variant={isDefaultPreset ? 'contained' : 'outlined'}
                          onClick={() => {
                            setDefaultPreset(elementType, preset.id);
                            emitPresetMetadataChange();
                          }}
                        >
                          {isDefaultPreset
                            ? t('stylePresets.defaultPreset', 'Standard-Preset')
                            : t('stylePresets.setAsDefault', 'Als Standard')}
                        </Button>
                        {showElementActions && onApplyPresetToSource && (
                          <Button
                            variant="text"
                            onClick={() => handleApplyPreset(preset.style)}
                          >
                            {t('stylePresets.applyToCurrentElement', 'Für aktuelles Element übernehmen')}
                          </Button>
                        )}
                        {showElementActions && (
                          <Button
                            variant="text"
                            onClick={() => setPendingConfirmation({
                              kind: 'update',
                              presetId: preset.id,
                              presetName: preset.name,
                            })}
                          >
                            {t('stylePresets.deriveFromCurrentElement', 'Aus aktuellem Element ableiten')}
                          </Button>
                        )}
                        <Tooltip title={t('stylePresets.deletePreset', 'Preset löschen')} arrow>
                          <IconButton
                            size="small"
                            onClick={() => setPendingConfirmation({
                              kind: 'delete',
                              presetId: preset.id,
                              presetName: preset.name,
                            })}
                            aria-label={t('stylePresets.deletePreset', 'Preset löschen')}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
              {filteredPresets.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('stylePresets.noNamedPresetsForType', 'Für diesen Elementtyp wurden noch keine eigenen Presets gespeichert.')}
                </Typography>
              )}
            </Box>

            {canUseSource && sourceElement && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('stylePresets.createFromSelection', 'Neues Preset aus aktuellem Element anlegen')}
                </Typography>
                <Button variant="contained" onClick={handleCreatePreset}>
                  {t('stylePresets.createPreset', 'Neues Preset anlegen')}
                </Button>
                <FormControlLabel
                  sx={{ mt: 0.5, display: 'block' }}
                  control={(
                    <Checkbox
                      checked={setAsDefaultOnCreate}
                      onChange={(event) => setSetAsDefaultOnCreate(event.target.checked)}
                    />
                  )}
                  label={t('stylePresets.setDefaultOnCreate', 'Nach dem Anlegen als Standard verwenden')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {t('stylePresets.renameAfterCreateHint', 'Der Name kann danach über das Stiftsymbol geändert werden.')}
                </Typography>
              </Paper>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingConfirmation !== null}
        onClose={() => setPendingConfirmation(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {pendingConfirmation?.kind === 'delete'
            ? t('stylePresets.confirmDeleteTitle', 'Preset löschen?')
            : t('stylePresets.confirmUpdateTitle', 'Preset überschreiben?')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingConfirmation?.kind === 'delete'
              ? t('stylePresets.confirmDeleteText', {
                name: pendingConfirmation.presetName,
                defaultValue: 'Möchtest du "{{name}}" wirklich löschen?',
              })
              : t('stylePresets.confirmUpdateText', {
                name: pendingConfirmation?.presetName ?? '',
                defaultValue: 'Möchtest du "{{name}}" wirklich mit dem Stil des aktuell ausgewählten Elements überschreiben?',
              })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingConfirmation(null)}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button
            onClick={handleConfirmedAction}
            color={pendingConfirmation?.kind === 'delete' ? 'error' : 'primary'}
            variant="contained"
          >
            {pendingConfirmation?.kind === 'delete'
              ? t('stylePresets.confirmDeleteAction', 'Löschen')
              : t('stylePresets.confirmUpdateAction', 'Überschreiben')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
