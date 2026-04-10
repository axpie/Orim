import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { Board, GridStyle, StickyNotePreset } from '../../../types/models';
import { useBoardStore } from '../store/boardStore';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createBoardMetadataUpdatedOperation } from '../realtime/boardOperations';
import {
  createStickyNotePresetDraft,
  getDefaultStickyNotePresets,
  getEffectiveStickyNotePresets,
} from '../stickyNotePresets';
import { getThemes } from '../../../api/themes';
import {
  ICON_GROUP_DEFINITIONS,
  resolveEnabledIconGroupKeys,
} from '../icons/iconCatalog';

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
  const board = useBoardStore((s) => s.board);

  if (!open || !board) {
    return null;
  }

  return (
    <OpenBoardSettingsDialog
      board={board}
      onClose={onClose}
      onBoardChanged={onBoardChanged}
    />
  );
}

interface OpenBoardSettingsDialogProps {
  board: Board;
  onClose: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
}

function OpenBoardSettingsDialog({ board, onClose, onBoardChanged }: OpenBoardSettingsDialogProps) {
  const { t } = useTranslation();
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const [draftPresets, setDraftPresets] = useState<StickyNotePreset[]>(() => getEffectiveStickyNotePresets(board, t));
  const [usePinnedSurface, setUsePinnedSurface] = useState(() => !!board.surfaceColor);
  const [draftSurfaceColor, setDraftSurfaceColor] = useState(() => board.surfaceColor ?? '#ffffff');
  const [draftThemeKey, setDraftThemeKey] = useState<string>(() => board.themeKey ?? '');
  const [draftGridStyle, setDraftGridStyle] = useState<GridStyle>(() => board.gridStyle ?? 'lines');
  const [draftEnabledIconGroups, setDraftEnabledIconGroups] = useState(() => resolveEnabledIconGroupKeys(board.enabledIconGroups));

  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });

  const validationMessage = useMemo(() => {
    if (draftPresets.length === 0) {
      return t('boardSettings.atLeastOnePreset');
    }

    if (draftPresets.some((preset) => preset.label.trim().length === 0)) {
      return t('boardSettings.presetLabelRequired');
    }

    return null;
  }, [draftPresets, t]);

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
    const surfaceColor = usePinnedSurface ? draftSurfaceColor : null;
    const themeKey = draftThemeKey || null;
    updateBoard({ stickyNotePresets, surfaceColor, themeKey, gridStyle: draftGridStyle, enabledIconGroups: draftEnabledIconGroups });
    onBoardChanged?.('Metadata', createBoardMetadataUpdatedOperation({
      title: board.title,
      labelOutlineEnabled: board.labelOutlineEnabled,
      arrowOutlineEnabled: board.arrowOutlineEnabled,
      gridStyle: draftGridStyle,
      surfaceColor,
      themeKey,
      enabledIconGroups: draftEnabledIconGroups,
      customColors: board.customColors,
      recentColors: board.recentColors,
      stickyNotePresets,
      stylePresetState: board.stylePresetState,
    }));
    onClose();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('boardSettings.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Board theme */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('boardSettings.boardTheme', 'Board-Theme')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('boardSettings.boardThemeDescription', 'Legt ein gemeinsames Theme für alle Nutzer fest. Ohne Auswahl nutzt jeder sein persönliches Theme.')}
            </Typography>
            <TextField
              select
              size="small"
              value={draftThemeKey}
              onChange={(e) => setDraftThemeKey(e.target.value)}
              fullWidth
            >
              <MenuItem value="">{t('boardSettings.noFixedTheme', '— Persönliches Theme —')}</MenuItem>
              {themes.filter((theme) => theme.isEnabled).map((theme) => (
                <MenuItem key={theme.key} value={theme.key}>
                  {theme.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Board background color */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('boardSettings.canvasBackground', 'Hintergrundfarbe')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('boardSettings.canvasBackgroundDescription', 'Legt eine gemeinsame Hintergrundfarbe für alle Nutzer fest, unabhängig vom persönlichen Theme.')}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={usePinnedSurface}
                    onChange={(e) => setUsePinnedSurface(e.target.checked)}
                    size="small"
                  />
                }
                label={t('boardSettings.useFixedBackground', 'Eigene Farbe verwenden')}
              />
              {usePinnedSurface && (
                <TextField
                  type="color"
                  size="small"
                  value={draftSurfaceColor}
                  onChange={(e) => setDraftSurfaceColor(e.target.value)}
                  InputProps={{ sx: { px: 0.5, width: 88 } }}
                  inputProps={{ 'aria-label': t('boardSettings.canvasBackground', 'Hintergrundfarbe') }}
                />
              )}
            </Stack>
          </Box>

          {/* Grid style */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('boardSettings.gridStyle', 'Raster')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('boardSettings.gridStyleDescription', 'Legt den Raster-Stil für dieses Board fest.')}
            </Typography>
            <ToggleButtonGroup
              value={draftGridStyle}
              exclusive
              onChange={(_e, value: GridStyle | null) => {
                if (value !== null) setDraftGridStyle(value);
              }}
              size="small"
            >
              <ToggleButton value="lines">
                {t('boardSettings.gridStyleLines', 'Linien')}
              </ToggleButton>
              <ToggleButton value="dots">
                {t('boardSettings.gridStyleDots', 'Punkte')}
              </ToggleButton>
              <ToggleButton value="none">
                {t('boardSettings.gridStyleNone', 'Kein Raster')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Accordion disableGutters defaultExpanded={false} sx={{ '&::before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="subtitle2">
                  {t('boardSettings.iconGroupsTitle', 'Icon-Gruppen')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('boardSettings.iconGroupsDescription', 'Steuert, welche Icon-Kategorien als Schnellzugriffe in der Toolbar für dieses Board sichtbar sind. Der Dialog zeigt weiterhin alle Icons.')}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    pb: 0.75,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {t('boardSettings.toggleAllIconGroups', 'Alle ein-/ausschalten')}
                  </Typography>
                  <Checkbox
                    checked={draftEnabledIconGroups.length === ICON_GROUP_DEFINITIONS.length}
                    indeterminate={draftEnabledIconGroups.length > 0 && draftEnabledIconGroups.length < ICON_GROUP_DEFINITIONS.length}
                    onChange={(event) => setDraftEnabledIconGroups(
                      event.target.checked
                        ? ICON_GROUP_DEFINITIONS.map((group) => group.key)
                        : [],
                    )}
                    size="small"
                  />
                </Box>
                {ICON_GROUP_DEFINITIONS.map((group) => (
                  <Box
                    key={group.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {t(group.labelKey, group.defaultLabel)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(group.descriptionKey, group.defaultDescription)}
                      </Typography>
                    </Box>
                    <Switch
                      checked={draftEnabledIconGroups.includes(group.key)}
                      onChange={(event) => setDraftEnabledIconGroups((current) => (
                        event.target.checked
                          ? Array.from(new Set([...current, group.key]))
                          : current.filter((candidate) => candidate !== group.key)
                      ))}
                      size="small"
                    />
                  </Box>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion disableGutters defaultExpanded={false} sx={{ '&::before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="subtitle2">
                  {t('boardSettings.stickyPresets')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('boardSettings.description')}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
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
            </AccordionDetails>
          </Accordion>
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
