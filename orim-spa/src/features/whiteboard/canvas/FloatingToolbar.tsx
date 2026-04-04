import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  IconButton,
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
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { createElementUpdateCommand, createChangedKeysByElementId, createDeleteElementsCommand } from '../realtime/localBoardCommands';
import { createElementUpdatedOperation, createElementsDeletedOperation } from '../realtime/boardOperations';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import type { BoardElement } from '../../../types/models';

const TOOLBAR_GAP = 8;
const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#EF4444', '#F59E0B', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280', '#0EA5E9',
];
const STROKE_WIDTH_OPTIONS = [1, 2, 4];

interface FloatingToolbarProps {
  elements: BoardElement[];
  selectedIds: string[];
  zoom: number;
  cameraX: number;
  cameraY: number;
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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of selected) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  return { minX, minY, maxX, maxY };
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
  onClose: () => void;
  onColorChange: (color: string) => void;
}

function ColorPickerPopover({ anchorEl, open, color, onClose, onColorChange }: ColorPickerPopoverProps) {
  const [customHex, setCustomHex] = useState(color);

  const handleCustomCommit = () => {
    const trimmed = customHex.trim();
    if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed)) {
      onColorChange(trimmed);
    }
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 1.5, width: 200 } } }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {PRESET_COLORS.map((c) => (
          <IconButton
            key={c}
            size="small"
            onClick={() => { onColorChange(c); onClose(); }}
            sx={{
              width: 28,
              height: 28,
              p: 0,
              border: c === color ? '2px solid' : '1px solid',
              borderColor: c === color ? 'primary.main' : 'divider',
              borderRadius: '4px',
              backgroundColor: c,
              '&:hover': { backgroundColor: c, opacity: 0.85 },
            }}
            aria-label={c}
          />
        ))}
      </Box>
      <TextField
        size="small"
        fullWidth
        label="Hex"
        value={customHex}
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
  onChange: (value: number) => void;
}

function FontSizeStepper({ value, onChange }: FontSizeStepperProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mx: 0.25 }}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(8, value - 2))}
        sx={{ width: 24, height: 24 }}
        aria-label="Decrease font size"
      >
        <RemoveIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Typography variant="caption" sx={{ minWidth: 24, textAlign: 'center', fontSize: '0.75rem', userSelect: 'none' }}>
        {value}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onChange(Math.min(200, value + 2))}
        sx={{ width: 24, height: 24 }}
        aria-label="Increase font size"
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
  onClose: () => void;
  onChange: (value: number) => void;
}

function StrokeWidthSelector({ anchorEl, open, value, onClose, onChange }: StrokeWidthSelectorProps) {
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
          sx={{
            width: 32,
            height: 32,
            border: w === value ? '2px solid' : '1px solid',
            borderColor: w === value ? 'primary.main' : 'divider',
            borderRadius: '4px',
          }}
          aria-label={`Stroke width ${w}`}
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
  onBoardChanged,
  onOpenPropertiesPanel,
}: FloatingToolbarProps) {
  const updateElement = useBoardStore((s) => s.updateElement);
  const setElements = useBoardStore((s) => s.setElements);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const setDirty = useBoardStore((s) => s.setDirty);
  const pushCommand = useCommandStack((s) => s.push);

  const [fillAnchorEl, setFillAnchorEl] = useState<HTMLElement | null>(null);
  const [strokeAnchorEl, setStrokeAnchorEl] = useState<HTMLElement | null>(null);
  const [strokeWidthAnchorEl, setStrokeWidthAnchorEl] = useState<HTMLElement | null>(null);
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
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const deletedElements = elements.filter((el) => idSet.has(el.id));
    if (deletedElements.length === 0) return;

    setElements(elements.filter((el) => !idSet.has(el.id)));
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    setDirty(true);
    onBoardChanged('delete', createElementsDeletedOperation([...idSet]));
  }, [elements, selectedIds, setElements, pushCommand, setSelectedElementIds, setDirty, onBoardChanged]);

  // --- determine which controls to show ---
  const showFill = hasProperty(selected, 'fillColor');
  const showStroke = selected.length > 0 && selected.every(
    (el) => 'strokeColor' in el || ('color' in el && el.$type === 'text'),
  );
  const showTextControls = selected.length > 0 && selected.every(
    (el) => el.$type === 'text' || el.$type === 'sticky',
  );
  const showStrokeWidth = selected.length > 0 && selected.every(
    (el) => el.$type === 'shape' || el.$type === 'arrow' || el.$type === 'drawing' || el.$type === 'frame',
  );

  // --- values ---
  const fillColor = showFill ? getCommonValue<string>(selected, 'fillColor') ?? '#CCCCCC' : '#CCCCCC';
  const strokeColor = showStroke
    ? (getCommonValue<string>(selected, 'strokeColor') ?? getCommonValue<string>(selected, 'color') ?? '#000000')
    : '#000000';
  const fontSize = showTextControls ? getCommonValue<number>(selected, 'fontSize') ?? 16 : 16;
  const isBold = getCommonValue<boolean>(selected, 'isBold') ?? false;
  const isItalic = getCommonValue<boolean>(selected, 'isItalic') ?? false;
  const strokeWidth = showStrokeWidth ? getCommonValue<number>(selected, 'strokeWidth') ?? 2 : 2;

  if (!bbox || selected.length === 0) return null;

  // --- screen positioning ---
  const screenCenterX = (((bbox.minX + bbox.maxX) / 2) - cameraX) * zoom;
  const screenTopY = (bbox.minY - cameraY) * zoom;
  const screenBottomY = (bbox.maxY - cameraY) * zoom;

  const { width: toolbarWidth, height: toolbarHeight } = toolbarSize;

  let left = screenCenterX - toolbarWidth / 2;
  let top = screenTopY - toolbarHeight - TOOLBAR_GAP;
  const positionedBelow = top < 4;
  if (positionedBelow) {
    top = screenBottomY + TOOLBAR_GAP;
  }

  // Clamp to viewport
  left = Math.max(4, Math.min(left, window.innerWidth - toolbarWidth - 4));
  top = Math.max(4, Math.min(top, window.innerHeight - toolbarHeight - 4));

  return (
    <Paper
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
        backgroundColor: 'rgba(var(--mui-palette-background-paperChannel, 255 255 255) / 0.88)',
        pointerEvents: 'auto',
      }}
    >
      {/* Fill Color */}
      {showFill && (
        <>
          <Tooltip title="Fill Color" arrow>
            <IconButton
              size="small"
              onClick={(e) => setFillAnchorEl(e.currentTarget)}
              sx={{ width: 32, height: 32, p: 0 }}
              aria-label="Fill color"
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
            onClose={() => setFillAnchorEl(null)}
            onColorChange={(c) => updateAll({ fillColor: c } as Partial<BoardElement>)}
          />
        </>
      )}

      {/* Stroke / Text Color */}
      {showStroke && (
        <>
          <Tooltip title="Stroke Color" arrow>
            <IconButton
              size="small"
              onClick={(e) => setStrokeAnchorEl(e.currentTarget)}
              sx={{ width: 32, height: 32, p: 0 }}
              aria-label="Stroke color"
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
            onChange={(v) => updateAll({ fontSize: v } as Partial<BoardElement>)}
          />
          <Tooltip title="Bold" arrow>
            <IconButton
              size="small"
              onClick={() => updateAll({ isBold: !isBold })}
              sx={{
                width: 32,
                height: 32,
                bgcolor: isBold ? 'action.selected' : 'transparent',
              }}
              aria-label="Bold"
            >
              <FormatBoldIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Italic" arrow>
            <IconButton
              size="small"
              onClick={() => updateAll({ isItalic: !isItalic })}
              sx={{
                width: 32,
                height: 32,
                bgcolor: isItalic ? 'action.selected' : 'transparent',
              }}
              aria-label="Italic"
            >
              <FormatItalicIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </>
      )}

      {/* Stroke width for shapes */}
      {showStrokeWidth && (
        <>
          <Tooltip title="Stroke Width" arrow>
            <IconButton
              size="small"
              onClick={(e) => setStrokeWidthAnchorEl(e.currentTarget)}
              sx={{ width: 32, height: 32 }}
              aria-label="Stroke width"
            >
              <LineWeightIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <StrokeWidthSelector
            anchorEl={strokeWidthAnchorEl}
            open={Boolean(strokeWidthAnchorEl)}
            value={strokeWidth}
            onClose={() => setStrokeWidthAnchorEl(null)}
            onChange={(w) => updateAll({ strokeWidth: w } as Partial<BoardElement>)}
          />
        </>
      )}

      {/* Separator before actions */}
      <Box sx={{ width: '1px', height: 24, bgcolor: 'divider', mx: 0.25 }} />

      {/* Delete */}
      <Tooltip title="Delete" arrow>
        <IconButton
          size="small"
          onClick={handleDelete}
          sx={{ width: 32, height: 32 }}
          aria-label="Delete"
        >
          <DeleteIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {/* More... (open properties panel) */}
      <Tooltip title="More properties" arrow>
        <IconButton
          size="small"
          onClick={onOpenPropertiesPanel}
          sx={{ width: 32, height: 32 }}
          aria-label="More properties"
        >
          <MoreHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Paper>
  );
});
