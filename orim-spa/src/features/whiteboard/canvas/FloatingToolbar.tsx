import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import LineWeightIcon from '@mui/icons-material/LineWeight';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import GestureIcon from '@mui/icons-material/Gesture';
import { useTranslation } from 'react-i18next';
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { createElementUpdateCommand, createChangedKeysByElementId, createDeleteElementsCommand } from '../realtime/localBoardCommands';
import {
  asOperationPayload,
  createElementUpdatedOperation,
  createElementsDeletedOperation,
} from '../realtime/boardOperations';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import type { BoardElement, FileElement, StylePresetStyle } from '../../../types/models';
import { getBoundsForElements, projectWorldToViewport } from '../cameraUtils';
import { useWhiteboardColorPalette } from '../controls/useWhiteboardColorPalette';
import { areAllSelectedElementsLocked, canDeleteSelection } from '../selectionLocking';
import { StylePresetDialog } from '../presets/StylePresetDialog';
import { useStylePresetStore } from '../presets/stylePresetStore';
import {
  applyStylePresetToElement,
  getStylePresetTypeForElement,
  getThemeDefaultStyleForPresetType,
} from '../presets/stylePresetUtils';
import { FALLBACK_BOARD_DEFAULTS } from './canvasUtils';

const TOOLBAR_GAP = 8;
const ROTATION_HANDLE_CLEARANCE = 36;
const STROKE_WIDTH_OPTIONS = [1, 2, 4];

interface FloatingToolbarProps {
  elements: BoardElement[];
  selectedIds: string[];
  zoom: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  onBoardChanged: (changeKind: string, operation?: BoardOperationPayload) => void;
  onOpenPropertiesPanel: () => void;
}

function getSelectedBoundingBox(
  elements: BoardElement[],
  selectedIds: string[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const idSet = new Set(selectedIds);
  const selected = elements.filter((el) => idSet.has(el.id));
  if (selected.length === 0) return null;

  const bounds = getBoundsForElements(selected, elements);
  if (!bounds) {
    return null;
  }

  return {
    minX: bounds.x,
    minY: bounds.y,
    maxX: bounds.x + bounds.width,
    maxY: bounds.y + bounds.height,
  };
}

function hasProperty<K extends string>(
  elements: BoardElement[],
  key: K,
): elements is (BoardElement & Record<K, unknown>)[] {
  return elements.length > 0 && elements.every((el) => key in el);
}

function getCommonValue<T>(elements: BoardElement[], key: string): T | undefined {
  if (elements.length === 0) return undefined;
  const first = (elements[0] as unknown as Record<string, unknown>)[key] as T;
  for (let i = 1; i < elements.length; i++) {
    if ((elements[i] as unknown as Record<string, unknown>)[key] !== first) return undefined;
  }
  return first;
}

// ---- Color Picker Popover ----

interface ColorPickerPopoverProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  color: string;
  disabled?: boolean;
  onClose: () => void;
  onColorChange: (color: string) => void;
}

function ColorPickerPopover({ anchorEl, open, color, disabled = false, onClose, onColorChange }: ColorPickerPopoverProps) {
  const { t } = useTranslation();
  const [customHex, setCustomHex] = useState(color);
  const { themeColors, regularColors } = useWhiteboardColorPalette();

  const handleCustomCommit = () => {
    const trimmed = customHex.trim();
    if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed)) {
      onColorChange(trimmed);
    }
  };

  const renderSwatchGroup = (groupLabel: string, colors: string[]) => {
    if (colors.length === 0) {
      return null;
    }

    return (
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {groupLabel}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {colors.map((swatch) => (
            <IconButton
              key={`${groupLabel}-${swatch}`}
              size="small"
              onClick={() => { onColorChange(swatch); onClose(); }}
              disabled={disabled}
              sx={{
                width: 28,
                height: 28,
                p: 0,
                border: swatch === color ? '2px solid' : '1px solid',
                borderColor: swatch === color ? 'primary.main' : 'divider',
                borderRadius: '4px',
                backgroundColor: swatch,
                '&:hover': { backgroundColor: swatch, opacity: 0.85 },
              }}
              aria-label={t('floatingToolbar.colorSwatch', { color: swatch, defaultValue: 'Farbe {{color}}' })}
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 1.5, width: 220 } } }}
    >
      {renderSwatchGroup(t('colors.themeColors', 'Theme-Farben'), themeColors)}
      {renderSwatchGroup(t('colors.regularColors', 'Weitere Farben'), regularColors)}
      <TextField
        size="small"
        fullWidth
        label={t('floatingToolbar.hex', 'Hex')}
        value={customHex}
        disabled={disabled}
        onChange={(e) => setCustomHex(e.target.value)}
        onBlur={handleCustomCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCustomCommit(); }}
        slotProps={{ htmlInput: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
      />
    </Popover>
  );
}

// ---- Font Size Stepper ----

interface FontSizeStepperProps {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function FontSizeStepper({ value, disabled = false, onChange }: FontSizeStepperProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mx: 0.25 }}>
      <IconButton
        size="small"
        disabled={disabled}
        onClick={() => onChange(Math.max(8, value - 2))}
        sx={{ width: 24, height: 24 }}
        aria-label={t('floatingToolbar.decreaseFontSize', 'Schrift verkleinern')}
      >
        <RemoveIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Typography
        variant="caption"
        sx={{
          minWidth: 24,
          textAlign: 'center',
          fontSize: '0.75rem',
          userSelect: 'none',
          color: disabled ? 'text.disabled' : 'inherit',
        }}
      >
        {value}
      </Typography>
      <IconButton
        size="small"
        disabled={disabled}
        onClick={() => onChange(Math.min(200, value + 2))}
        sx={{ width: 24, height: 24 }}
        aria-label={t('floatingToolbar.increaseFontSize', 'Schrift vergrößern')}
      >
        <AddIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}

// ---- Stroke Width Selector ----

interface StrokeWidthSelectorProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  value: number;
  disabled?: boolean;
  onClose: () => void;
  onChange: (value: number) => void;
}

function StrokeWidthSelector({ anchorEl, open, value, disabled = false, onClose, onChange }: StrokeWidthSelectorProps) {
  const { t } = useTranslation();
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 1, display: 'flex', gap: 0.5 } } }}
    >
      {STROKE_WIDTH_OPTIONS.map((w) => (
        <IconButton
          key={w}
          size="small"
          onClick={() => { onChange(w); onClose(); }}
          disabled={disabled}
          sx={{
            width: 32,
            height: 32,
            border: w === value ? '2px solid' : '1px solid',
            borderColor: w === value ? 'primary.main' : 'divider',
            borderRadius: '4px',
          }}
          aria-label={t('floatingToolbar.strokeWidthOption', { width: w, defaultValue: 'Rahmenbreite {{width}}' })}
        >
          <Box sx={{ width: 18, height: w + 1, bgcolor: 'text.primary', borderRadius: 0.5 }} />
        </IconButton>
      ))}
    </Popover>
  );
}

// ---- Main FloatingToolbar ----

export const FloatingToolbar = React.memo(function FloatingToolbar({
  elements,
  selectedIds,
  zoom,
  cameraX,
  cameraY,
  viewportWidth,
  viewportHeight,
  onBoardChanged,
  onOpenPropertiesPanel,
}: FloatingToolbarProps) {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const updateElement = useBoardStore((s) => s.updateElement);
  const setElements = useBoardStore((s) => s.setElements);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const setDirty = useBoardStore((s) => s.setDirty);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setResumeDrawingElementId = useBoardStore((s) => s.setResumeDrawingElementId);
  const pendingStickyNotePresetId = useBoardStore((s) => s.pendingStickyNotePresetId);
  const pushCommand = useCommandStack((s) => s.push);
  const { activeTheme } = useWhiteboardColorPalette();

  const [fillAnchorEl, setFillAnchorEl] = useState<HTMLElement | null>(null);
  const [strokeAnchorEl, setStrokeAnchorEl] = useState<HTMLElement | null>(null);
  const [strokeWidthAnchorEl, setStrokeWidthAnchorEl] = useState<HTMLElement | null>(null);
  const [stylePresetAnchorEl, setStylePresetAnchorEl] = useState<HTMLElement | null>(null);
  const [stylePresetDialogOpen, setStylePresetDialogOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState<{ width: number; height: number }>({ width: 280, height: 44 });

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const measure = () => {
      const { offsetWidth, offsetHeight } = el;
      if (offsetWidth > 0 && offsetHeight > 0) {
        setToolbarSize((prev) =>
          prev.width === offsetWidth && prev.height === offsetHeight
            ? prev
            : { width: offsetWidth, height: offsetHeight },
        );
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const selected = useMemo(
    () => {
      const idSet = new Set(selectedIds);
      return elements.filter((el) => idSet.has(el.id));
    },
    [elements, selectedIds],
  );
  const stylePresets = useStylePresetStore((state) => state.presets);

  const bbox = useMemo(
    () => getSelectedBoundingBox(elements, selectedIds),
    [elements, selectedIds],
  );

  // --- update helper (mirrors PropertiesPanel) ---
  const update = useCallback((id: string, changes: Partial<BoardElement>) => {
    const currentElement = elements.find((el) => el.id === id);
    if (!currentElement) return;

    const updatedElement = { ...currentElement, ...changes } as BoardElement;
    const changedKeys = Object.keys(changes).filter((key) => {
      const currentValue = (currentElement as unknown as Record<string, unknown>)[key];
      const nextValue = (updatedElement as unknown as Record<string, unknown>)[key];
      return !Object.is(currentValue, nextValue);
    });

    if (changedKeys.length === 0) return;

    const isLockToggleOnly = changedKeys.every((key) => key === 'isLocked');
    if (currentElement.isLocked === true && !isLockToggleOnly) {
      return;
    }

    updateElement(id, changes);
    pushCommand(createElementUpdateCommand(
      [currentElement],
      [updatedElement],
      createChangedKeysByElementId([id], changedKeys),
    ));
    setDirty(true);
    onBoardChanged('edit', createElementUpdatedOperation(updatedElement));
  }, [elements, updateElement, pushCommand, setDirty, onBoardChanged]);

  const updateAll = useCallback((changes: Partial<BoardElement>) => {
    for (const el of selected) {
      update(el.id, changes);
    }
  }, [selected, update]);

  const handleDelete = useCallback(() => {
    if (!canDeleteSelection(selected)) return;
    const idSet = new Set(selectedIds);
    const deletedElements = elements.filter((el) => idSet.has(el.id));
    if (deletedElements.length === 0) return;

    setElements(elements.filter((el) => !idSet.has(el.id)));
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    setDirty(true);
    onBoardChanged('delete', createElementsDeletedOperation([...idSet]));
  }, [elements, onBoardChanged, pushCommand, selected, selectedIds, setDirty, setElements, setSelectedElementIds]);

  const handleDownload = useCallback(() => {
    if (selected.length !== 1 || selected[0].$type !== 'file') return;
    const file = selected[0] as FileElement;
    const a = document.createElement('a');
    a.href = file.fileUrl;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [selected]);

  // --- determine which controls to show ---
  const showFill = hasProperty(selected, 'fillColor');
  const showStroke = selected.length > 0 && selected.every(
    (el) => 'strokeColor' in el || ('color' in el && (
      el.$type === 'text'
      || el.$type === 'richtext'
      || el.$type === 'markdown'
      || el.$type === 'sticky'
      || el.$type === 'icon'
    )),
  );
  const showTextControls = selected.length > 0 && selected.every(
    (el) => el.$type === 'text' || el.$type === 'richtext' || el.$type === 'markdown' || el.$type === 'sticky',
  );
  const showStrokeWidth = selected.length > 0 && selected.every(
    (el) => el.$type === 'shape' || el.$type === 'arrow' || el.$type === 'drawing' || el.$type === 'frame',
  );

  // --- values ---
  const fillColor = showFill ? getCommonValue<string>(selected, 'fillColor') ?? '#CCCCCC' : '#CCCCCC';
  const strokeColor = showStroke
    ? (getCommonValue<string>(selected, 'strokeColor') ?? getCommonValue<string>(selected, 'color') ?? '#000000')
    : '#000000';
  const strokeColorLabel = selected.every((el) => 'color' in el && !('strokeColor' in el))
    ? t('properties.color', 'Farbe')
    : t('properties.strokeColor', 'Rahmenfarbe');
  const fontSize = showTextControls ? getCommonValue<number>(selected, 'fontSize') ?? 16 : 16;
  const isBold = getCommonValue<boolean>(selected, 'isBold') ?? false;
  const isItalic = getCommonValue<boolean>(selected, 'isItalic') ?? false;
  const strokeWidth = showStrokeWidth ? getCommonValue<number>(selected, 'strokeWidth') ?? 2 : 2;
  const areAllLocked = areAllSelectedElementsLocked(selected);
  const canDeleteCurrentSelection = canDeleteSelection(selected);
  const showDownload = selected.length === 1 && selected[0].$type === 'file';
  const showContinueDrawing = selected.length === 1 && selected[0].$type === 'drawing' && !areAllLocked;
  const presetSelectionType = useMemo(() => {
    if (selected.length === 0) {
      return null;
    }

    const firstType = getStylePresetTypeForElement(selected[0]);
    if (!firstType) {
      return null;
    }

    return selected.every((element) => getStylePresetTypeForElement(element) === firstType) ? firstType : null;
  }, [selected]);
  const presetSourceElement = selected.length === 1 && presetSelectionType ? selected[0] : null;
  const presetPresets = presetSelectionType
    ? stylePresets.filter((preset) => preset.type === presetSelectionType)
    : [];
  const rawBoardDefaults = activeTheme?.boardDefaults ?? FALLBACK_BOARD_DEFAULTS;
  const boardSurfaceColor = board?.surfaceColor ?? null;
  const boardDefaults = useMemo(
    () => (boardSurfaceColor ? { ...rawBoardDefaults, surfaceColor: boardSurfaceColor } : rawBoardDefaults),
    [boardSurfaceColor, rawBoardDefaults],
  );
  const themeDefaultPresetStyle = useMemo(
    () => presetSelectionType
      ? getThemeDefaultStyleForPresetType(presetSelectionType, {
        boardDefaults,
        board,
        pendingStickyNotePresetId,
      })
      : null,
    [board, boardDefaults, pendingStickyNotePresetId, presetSelectionType],
  );

  if (!bbox || selected.length === 0) return null;

  const handleApplyPresetStyle = (style: StylePresetStyle) => {
    if (!presetSelectionType) {
      return;
    }

    const styleKeys = Object.keys(style);
    if (styleKeys.length === 0) {
      return;
    }

    const updates = selected
      .filter((element) => getStylePresetTypeForElement(element) === presetSelectionType && element.isLocked !== true)
      .map((element) => {
        const updatedElement = applyStylePresetToElement(element, style);
        const changedKeys = styleKeys.filter((key) => {
          const currentValue = (element as unknown as Record<string, unknown>)[key];
          const nextValue = (updatedElement as unknown as Record<string, unknown>)[key];
          return !Object.is(currentValue, nextValue);
        });

        return changedKeys.length > 0 ? { before: element, after: updatedElement, changedKeys } : null;
      })
      .filter((entry): entry is { before: BoardElement; after: BoardElement; changedKeys: string[] } => entry !== null);

    if (updates.length === 0) {
      setStylePresetAnchorEl(null);
      return;
    }

    const updateMap = new Map(updates.map((entry) => [entry.after.id, entry.after]));
    setElements(elements.map((element) => updateMap.get(element.id) ?? element));
    pushCommand(createElementUpdateCommand(
      updates.map((entry) => entry.before),
      updates.map((entry) => entry.after),
      Object.fromEntries(updates.map((entry) => [entry.after.id, entry.changedKeys])),
    ));
    useBoardStore.getState().rememberStyleSnapshot(presetSelectionType, style as never);
    setDirty(true);
    onBoardChanged('edit', asOperationPayload(
      updates.map((entry) => createElementUpdatedOperation(entry.after)),
    ));
    setStylePresetAnchorEl(null);
  };

  // --- screen positioning ---
  const screenCenterX = projectWorldToViewport((bbox.minX + bbox.maxX) / 2, bbox.minY, zoom, cameraX, cameraY).x;
  const screenTopY = projectWorldToViewport(bbox.minX, bbox.minY, zoom, cameraX, cameraY).y;
  const screenBottomY = projectWorldToViewport(bbox.maxX, bbox.maxY, zoom, cameraX, cameraY).y;

  const { width: toolbarWidth, height: toolbarHeight } = toolbarSize;

  let left = screenCenterX - toolbarWidth / 2;
  let top = screenTopY - toolbarHeight - ROTATION_HANDLE_CLEARANCE;
  const positionedBelow = top < TOOLBAR_GAP;
  if (positionedBelow) {
    top = screenBottomY + TOOLBAR_GAP;
  }

  left = Math.max(TOOLBAR_GAP, Math.min(left, viewportWidth - toolbarWidth - TOOLBAR_GAP));
  top = Math.max(TOOLBAR_GAP, Math.min(top, viewportHeight - toolbarHeight - TOOLBAR_GAP));

  return (
    <Paper
      data-whiteboard-export-hidden="true"
      ref={toolbarRef}
      elevation={3}
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        left,
        top,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.75,
        py: 0.25,
        height: 40,
        borderRadius: 2,
        backdropFilter: 'blur(8px)',
        background: 'var(--orim-board-toolbar-bg, rgba(var(--mui-palette-background-paperChannel, 255 255 255) / 0.94))',
        color: 'var(--orim-board-toolbar-text, currentColor)',
        border: '1px solid transparent',
        borderColor: 'var(--orim-board-toolbar-border, rgba(var(--mui-palette-dividerChannel, 0 0 0) / 0.18))',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
        '& .MuiIconButton-root': {
          color: 'inherit',
        },
        '& .MuiIconButton-root.Mui-disabled': {
          opacity: 1,
          color: 'rgba(var(--mui-palette-text-secondaryChannel, 107 114 128) / 0.72)',
          backgroundColor: 'rgba(var(--mui-palette-text-secondaryChannel, 107 114 128) / 0.14)',
        },
        '& .MuiIconButton-root.Mui-disabled .MuiSvgIcon-root': {
          opacity: 1,
        },
        '& .MuiSvgIcon-root': {
          color: 'inherit',
        },
        pointerEvents: 'auto',
      }}
    >
      {/* Fill Color */}
      {showFill && (
        <>
          <Tooltip title={t('properties.fillColor', 'Fuellfarbe')} arrow>
            <IconButton
              size="small"
              onClick={(e) => setFillAnchorEl(e.currentTarget)}
              disabled={areAllLocked}
              sx={{ width: 32, height: 32, p: 0 }}
              aria-label={t('properties.fillColor', 'Fuellfarbe')}
            >
              <FormatColorFillIcon sx={{ fontSize: 18 }} />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 2,
                  left: 4,
                  right: 4,
                  height: 4,
                  borderRadius: 0.5,
                  bgcolor: fillColor,
                  border: '0.5px solid',
                  borderColor: 'divider',
                }}
              />
            </IconButton>
          </Tooltip>
          <ColorPickerPopover
            anchorEl={fillAnchorEl}
            open={Boolean(fillAnchorEl)}
            color={fillColor}
            disabled={areAllLocked}
            onClose={() => setFillAnchorEl(null)}
            onColorChange={(c) => updateAll({ fillColor: c } as Partial<BoardElement>)}
          />
        </>
      )}

      {/* Stroke / Text Color */}
      {showStroke && (
        <>
          <Tooltip title={strokeColorLabel} arrow>
            <IconButton
              size="small"
              onClick={(e) => setStrokeAnchorEl(e.currentTarget)}
              disabled={areAllLocked}
              sx={{ width: 32, height: 32, p: 0 }}
              aria-label={strokeColorLabel}
            >
              <BorderColorIcon sx={{ fontSize: 18 }} />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 2,
                  left: 4,
                  right: 4,
                  height: 4,
                  borderRadius: 0.5,
                  bgcolor: strokeColor,
                  border: '0.5px solid',
                  borderColor: 'divider',
                }}
              />
            </IconButton>
          </Tooltip>
          <ColorPickerPopover
            anchorEl={strokeAnchorEl}
            open={Boolean(strokeAnchorEl)}
            color={strokeColor}
            disabled={areAllLocked}
            onClose={() => setStrokeAnchorEl(null)}
            onColorChange={(c) => {
              const key = selected.every((el) => 'strokeColor' in el) ? 'strokeColor' : 'color';
              updateAll({ [key]: c } as Partial<BoardElement>);
            }}
          />
        </>
      )}

      {/* Separator */}
      {(showFill || showStroke) && (showTextControls || showStrokeWidth) && (
        <Box sx={{ width: '1px', height: 24, bgcolor: 'divider', mx: 0.25 }} />
      )}

      {/* Text controls: font size + bold + italic */}
      {showTextControls && (
        <>
          <FontSizeStepper
            value={fontSize}
            disabled={areAllLocked}
            onChange={(v) => updateAll({ fontSize: v } as Partial<BoardElement>)}
          />
          <Tooltip title={t('properties.bold', 'Fett')} arrow>
            <IconButton
              size="small"
              onClick={() => updateAll({ isBold: !isBold })}
              disabled={areAllLocked}
              sx={{
                width: 32,
                height: 32,
                bgcolor: isBold ? 'action.selected' : 'transparent',
              }}
              aria-label={t('properties.bold', 'Fett')}
            >
              <FormatBoldIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('properties.italic', 'Kursiv')} arrow>
            <IconButton
              size="small"
              onClick={() => updateAll({ isItalic: !isItalic })}
              disabled={areAllLocked}
              sx={{
                width: 32,
                height: 32,
                bgcolor: isItalic ? 'action.selected' : 'transparent',
              }}
              aria-label={t('properties.italic', 'Kursiv')}
            >
              <FormatItalicIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </>
      )}

      {/* Stroke width for shapes */}
      {showStrokeWidth && (
        <>
          <Tooltip title={t('properties.strokeWidth', 'Rahmenbreite')} arrow>
            <IconButton
              size="small"
              onClick={(e) => setStrokeWidthAnchorEl(e.currentTarget)}
              disabled={areAllLocked}
              sx={{ width: 32, height: 32 }}
              aria-label={t('properties.strokeWidth', 'Rahmenbreite')}
            >
              <LineWeightIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <StrokeWidthSelector
            anchorEl={strokeWidthAnchorEl}
            open={Boolean(strokeWidthAnchorEl)}
            value={strokeWidth}
            disabled={areAllLocked}
            onClose={() => setStrokeWidthAnchorEl(null)}
            onChange={(w) => updateAll({ strokeWidth: w } as Partial<BoardElement>)}
          />
        </>
      )}

      {/* Separator before actions */}
      <Box sx={{ width: '1px', height: 24, bgcolor: 'divider', mx: 0.25 }} />

      {presetSelectionType && (
        <Tooltip title={t('stylePresets.applyPreset', 'Formatvorlage anwenden')} arrow>
          <IconButton
            size="small"
            onClick={(event) => setStylePresetAnchorEl(event.currentTarget)}
            sx={{ width: 32, height: 32 }}
            aria-label={t('stylePresets.applyPreset', 'Formatvorlage anwenden')}
          >
            <AutoFixHighIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Download — only for a single selected FileElement (images + other files) */}
      {showDownload && (
        <Tooltip title={t('files.download', 'Herunterladen')} arrow>
          <IconButton
            size="small"
            onClick={handleDownload}
            sx={{ width: 32, height: 32 }}
            aria-label={t('files.download', 'Herunterladen')}
          >
            <DownloadIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Continue Drawing */}
      {showContinueDrawing && (
        <Tooltip title={t('floatingToolbar.continueDrawing', 'Zeichnen fortsetzen')} arrow>
          <IconButton
            size="small"
            onClick={() => {
              setResumeDrawingElementId(selected[0].id);
              setActiveTool('drawing');
            }}
            sx={{ width: 32, height: 32 }}
            aria-label={t('floatingToolbar.continueDrawing', 'Zeichnen fortsetzen')}
          >
            <GestureIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title={areAllLocked ? t('contextMenu.unlock', 'Entsperren') : t('contextMenu.lock', 'Sperren')} arrow>
        <IconButton
          size="small"
          onClick={() => updateAll({ isLocked: !areAllLocked })}
          sx={{ width: 32, height: 32 }}
          aria-label={areAllLocked ? t('contextMenu.unlock', 'Entsperren') : t('contextMenu.lock', 'Sperren')}
        >
          {areAllLocked ? <LockOpenIcon sx={{ fontSize: 18 }} /> : <LockIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Tooltip>

      {/* Delete */}
      <Tooltip title={t('toolbar.delete', 'Löschen')} arrow>
        <IconButton
          size="small"
          onClick={handleDelete}
          disabled={!canDeleteCurrentSelection}
          sx={{ width: 32, height: 32 }}
          aria-label={t('toolbar.delete', 'Löschen')}
        >
          <DeleteIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {/* More... (open properties panel) */}
      <Tooltip title={t('floatingToolbar.moreProperties', 'Weitere Eigenschaften')} arrow>
        <IconButton
          size="small"
          onClick={onOpenPropertiesPanel}
          sx={{ width: 32, height: 32 }}
          aria-label={t('floatingToolbar.moreProperties', 'Weitere Eigenschaften')}
        >
          <MoreHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={stylePresetAnchorEl}
        open={Boolean(stylePresetAnchorEl)}
        onClose={() => setStylePresetAnchorEl(null)}
      >
        {themeDefaultPresetStyle && (
          <MenuItem onClick={() => handleApplyPresetStyle(themeDefaultPresetStyle)}>
            {t('stylePresets.themeDefault', 'Theme-Standard')}
          </MenuItem>
        )}
        {presetPresets.map((preset) => (
          <MenuItem key={preset.id} onClick={() => handleApplyPresetStyle(preset.style)}>
            {preset.name}
          </MenuItem>
        ))}
        {!themeDefaultPresetStyle && presetPresets.length === 0 && (
          <MenuItem disabled>
            {t('stylePresets.noPresetsForType', 'Für diesen Elementtyp wurden noch keine Presets gespeichert.')}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setStylePresetAnchorEl(null);
            setStylePresetDialogOpen(true);
          }}
        >
          {presetSourceElement
            ? t('stylePresets.manageButton', 'Formatvorlagen ...')
            : t('stylePresets.manageWithoutSource', 'Formatvorlagen ...')}
        </MenuItem>
      </Menu>
      <StylePresetDialog
        open={stylePresetDialogOpen}
        onClose={() => setStylePresetDialogOpen(false)}
        elementType={presetSelectionType}
        sourceElement={presetSourceElement}
        onBoardChanged={onBoardChanged}
        onApplyPresetToSource={handleApplyPresetStyle}
      />
    </Paper>
  );
});
