import React, { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Divider,
  IconButton,
  Paper,
  TextField,
  MenuItem,
  FormControlLabel,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignCenterIcon from '@mui/icons-material/VerticalAlignCenter';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { ColorInputField } from '../controls/ColorInputField';
import { PreviewSelect, type PreviewSelectOption } from '../controls/PreviewSelect';
import { getIconDisplayName } from '../icons/iconCatalog';
import { resolveFrameTitleFontSize } from '../shapes/FrameRenderer';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createElementUpdatedOperation } from '../realtime/boardOperations';
import {
  createChangedKeysByElementId,
  createElementUpdateCommand,
} from '../realtime/localBoardCommands';
import {
  ArrowLineStyle,
  ArrowHeadStyle,
  BorderLineStyle,
  DockPoint,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  ImageFit,
  type BoardElement,
  type BoardElementBase,
  type ShapeElement,
  type TextElement,
  type StickyNoteElement,
  type FrameElement,
  type ArrowElement,
  type IconElement,
  type ImageElement,
} from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { getLineDashArray } from '../../../utils/lineStyles';
import { getDefaultLabelFontSize, resolveLabelFontSize, resolveTextFontSize } from '../../../utils/textLayout';

const FONT_FAMILY_DEFAULT = '__default__';

const FONT_FAMILY_OPTIONS = [
  { value: FONT_FAMILY_DEFAULT, label: 'Theme Default', previewFamily: null },
  { value: 'Arial, sans-serif', label: 'Arial', previewFamily: 'Arial, sans-serif' },
  { value: 'Verdana, sans-serif', label: 'Verdana', previewFamily: 'Verdana, sans-serif' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS', previewFamily: 'Trebuchet MS, sans-serif' },
  { value: 'Georgia, serif', label: 'Georgia', previewFamily: 'Georgia, serif' },
  { value: 'Times New Roman, serif', label: 'Times New Roman', previewFamily: 'Times New Roman, serif' },
  { value: 'Courier New, monospace', label: 'Courier New', previewFamily: 'Courier New, monospace' },
];

function renderLineStylePreview(style: BorderLineStyle | string): ReactNode {
  const dash = getLineDashArray(style, 2.4);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <svg width="72" height="16" viewBox="0 0 72 16" aria-hidden="true" focusable="false">
        <line
          x1="4"
          y1="8"
          x2="68"
          y2="8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={dash?.join(' ')}
          strokeLinecap="round"
        />
      </svg>
    </Box>
  );
}

function renderArrowHeadPreview(style: ArrowHeadStyle | string, position: 'start' | 'end'): ReactNode {
  const isStart = position === 'start';
  const headCenterX = 36;

  const marker = (() => {
    switch (style) {
      case ArrowHeadStyle.FilledTriangle:
        return isStart
          ? <polygon points="42,8 30,3 30,13" fill="currentColor" />
          : <polygon points="30,8 42,3 42,13" fill="currentColor" />;
      case ArrowHeadStyle.OpenTriangle:
        return isStart
          ? <polyline points="42,8 30,3 30,13 42,8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          : <polyline points="30,8 42,3 42,13 30,8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />;
      case ArrowHeadStyle.FilledCircle:
        return <circle cx={headCenterX} cy="8" r="5" fill="currentColor" />;
      case ArrowHeadStyle.OpenCircle:
        return <circle cx={headCenterX} cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />;
      case ArrowHeadStyle.None:
        return <line x1="31" y1="12" x2="41" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
      default:
        return null;
    }
  })();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <svg width="72" height="16" viewBox="0 0 72 16" aria-hidden="true" focusable="false">
        {marker}
      </svg>
    </Box>
  );
}

function TextStyleControls({
  element,
  onChange,
}: {
  element: Pick<BoardElementBase, 'isBold' | 'isItalic' | 'isUnderline' | 'isStrikethrough'>;
  onChange: (changes: Partial<BoardElementBase>) => void;
}) {
  const value = [
    element.isBold ? 'bold' : null,
    element.isItalic ? 'italic' : null,
    element.isUnderline ? 'underline' : null,
    element.isStrikethrough ? 'strikethrough' : null,
  ].filter(Boolean) as string[];

  return (
    <ToggleButtonGroup
      size="small"
      value={value}
      onChange={(_, nextValues: string[]) => {
        const next = new Set(nextValues);
        onChange({
          isBold: next.has('bold'),
          isItalic: next.has('italic'),
          isUnderline: next.has('underline'),
          isStrikethrough: next.has('strikethrough'),
        });
      }}
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}
    >
      <ToggleButton value="bold" title="Bold" aria-label="Bold"><FormatBoldIcon fontSize="small" /></ToggleButton>
      <ToggleButton value="italic" title="Italic" aria-label="Italic"><FormatItalicIcon fontSize="small" /></ToggleButton>
      <ToggleButton value="underline" title="Underline" aria-label="Underline"><FormatUnderlinedIcon fontSize="small" /></ToggleButton>
      <ToggleButton value="strikethrough" title="Strikethrough" aria-label="Strikethrough"><StrikethroughSIcon fontSize="small" /></ToggleButton>
    </ToggleButtonGroup>
  );
}

function AlignmentControls({
  horizontal,
  vertical,
  horizontalLabel,
  verticalLabel,
  onHorizontalChange,
  onVerticalChange,
  showVertical = true,
}: {
  horizontal: HorizontalLabelAlignment;
  vertical: VerticalLabelAlignment;
  horizontalLabel: string;
  verticalLabel: string;
  onHorizontalChange: (value: HorizontalLabelAlignment) => void;
  onVerticalChange: (value: VerticalLabelAlignment) => void;
  showVertical?: boolean;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {horizontalLabel}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          fullWidth
          value={horizontal}
          onChange={(_, value) => {
            if (value) {
              onHorizontalChange(value as HorizontalLabelAlignment);
            }
          }}
        >
          <ToggleButton value={HorizontalLabelAlignment.Left}><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
          <ToggleButton value={HorizontalLabelAlignment.Center}><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
          <ToggleButton value={HorizontalLabelAlignment.Right}><FormatAlignRightIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {showVertical && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {verticalLabel}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            fullWidth
            value={vertical}
            onChange={(_, value) => {
              if (value) {
                onVerticalChange(value as VerticalLabelAlignment);
              }
            }}
          >
            <ToggleButton value={VerticalLabelAlignment.Top}><VerticalAlignTopIcon fontSize="small" /></ToggleButton>
            <ToggleButton value={VerticalLabelAlignment.Middle}><VerticalAlignCenterIcon fontSize="small" /></ToggleButton>
            <ToggleButton value={VerticalLabelAlignment.Bottom}><VerticalAlignBottomIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
    </Box>
  );
}

function NumericSliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const safeValue = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 1, alignItems: 'center' }}>
      <Box sx={{ px: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
          {label}
        </Typography>
        <Slider
          size="small"
          value={safeValue}
          min={min}
          max={max}
          step={step}
          onChange={(_, nextValue) => onChange(Number(Array.isArray(nextValue) ? nextValue[0] : nextValue))}
        />
      </Box>
      <TextField
        aria-label={label}
        size="small"
        type="number"
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
        inputProps={{ min, max, step }}
      />
    </Box>
  );
}

interface PropertiesPanelProps {
  onClose: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  mobile?: boolean;
}

export const PropertiesPanel = React.memo(function PropertiesPanel({ onClose, onBoardChanged, mobile = false }: PropertiesPanelProps) {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const selectedIds = useBoardStore((s) => s.selectedElementIds);
  const updateElement = useBoardStore((s) => s.updateElement);
  const setDirty = useBoardStore((s) => s.setDirty);
  const pushCommand = useCommandStack((s) => s.push);

  const elements = board?.elements ?? [];
  const selected = elements.filter((el: BoardElement) => selectedIds.includes(el.id));
  const el = selected.length === 1 ? selected[0] : null;
  const dockOptions = Object.values(DockPoint);
  const borderStyleOptions: PreviewSelectOption[] = [
    BorderLineStyle.Solid,
    BorderLineStyle.Dashed,
    BorderLineStyle.Dotted,
    BorderLineStyle.DashDot,
    BorderLineStyle.LongDash,
  ].map((style) => ({
    value: style,
    ariaLabel: style,
    preview: renderLineStylePreview(style),
  }));
  const sourceHeadOptions: PreviewSelectOption[] = [
    ArrowHeadStyle.None,
    ArrowHeadStyle.FilledTriangle,
    ArrowHeadStyle.OpenTriangle,
    ArrowHeadStyle.FilledCircle,
    ArrowHeadStyle.OpenCircle,
  ].map((style) => ({
    value: style,
    ariaLabel: style,
    preview: renderArrowHeadPreview(style, 'start'),
  }));
  const targetHeadOptions: PreviewSelectOption[] = [
    ArrowHeadStyle.None,
    ArrowHeadStyle.FilledTriangle,
    ArrowHeadStyle.OpenTriangle,
    ArrowHeadStyle.FilledCircle,
    ArrowHeadStyle.OpenCircle,
  ].map((style) => ({
    value: style,
    ariaLabel: style,
    preview: renderArrowHeadPreview(style, 'end'),
  }));
  const arrowLineStyleOptions: PreviewSelectOption[] = [
    ArrowLineStyle.Solid,
    ArrowLineStyle.Dashed,
    ArrowLineStyle.Dotted,
    ArrowLineStyle.DashDot,
    ArrowLineStyle.LongDash,
  ].map((style) => ({
    value: style,
    ariaLabel: style,
    preview: renderLineStylePreview(style),
  }));

  const update = (id: string, changes: Partial<BoardElement>) => {
    const currentElement = elements.find((element) => element.id === id);
    if (!currentElement) {
      return;
    }

    const updatedElement = { ...currentElement, ...changes } as BoardElement;
    const changedKeys = Object.keys(changes).filter((key) => {
      const currentValue = (currentElement as unknown as Record<string, unknown>)[key];
      const nextValue = (updatedElement as unknown as Record<string, unknown>)[key];

      if (Array.isArray(currentValue) || Array.isArray(nextValue)) {
        if (!Array.isArray(currentValue) || !Array.isArray(nextValue) || currentValue.length !== nextValue.length) {
          return true;
        }

        return currentValue.some((value, index) => !Object.is(value, nextValue[index]));
      }

      return !Object.is(currentValue, nextValue);
    });

    if (changedKeys.length === 0) {
      return;
    }

    updateElement(id, changes);
    pushCommand(createElementUpdateCommand(
      [currentElement],
      [updatedElement],
      createChangedKeysByElementId([id], changedKeys),
    ));
    setDirty(true);
    onBoardChanged?.('edit', createElementUpdatedOperation(updatedElement));
  };

  // When switching to Uniform, resize the element box to match the actual rendered image size.
  const handleImageFitChange = async (id: string, newFit: ImageFit) => {
    const imgEl = elements.find((e) => e.id === id) as ImageElement | undefined;
    if (!imgEl) return;

    if (newFit === ImageFit.Uniform) {
      try {
        const { natW, natH } = await new Promise<{ natW: number; natH: number }>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve({ natW: img.naturalWidth, natH: img.naturalHeight });
          img.onerror = reject;
          img.src = imgEl.imageUrl;
        });
        if (natW > 0 && natH > 0) {
          const scale = Math.min(imgEl.width / natW, imgEl.height / natH);
          const newW = natW * scale;
          const newH = natH * scale;
          const cx = imgEl.x + imgEl.width / 2;
          const cy = imgEl.y + imgEl.height / 2;
          update(id, { imageFit: newFit, width: newW, height: newH, x: cx - newW / 2, y: cy - newH / 2 });
          return;
        }
      } catch { /* fall through to plain update */ }
    }

    update(id, { imageFit: newFit });
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: mobile ? '100%' : 280,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        borderRadius: 0,
        borderLeft: mobile ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
        pt: mobile ? 'env(safe-area-inset-top)' : 0,
        pb: mobile ? 'env(safe-area-inset-bottom)' : 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
          {t('properties.title', 'Eigenschaften')}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

      {!el ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.length === 0
              ? t('properties.noElementSelected', 'Kein Element ausgewählt.')
              : t('properties.elementsSelected', { count: selected.length, defaultValue: '{{count}} Elemente ausgewählt.' })}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Position */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="X"
              type="number"
              size="small"
              value={Math.round(el.x)}
              onChange={(e) => update(el.id, { x: Number(e.target.value) })}
            />
            <TextField
              label="Y"
              type="number"
              size="small"
              value={Math.round(el.y)}
              onChange={(e) => update(el.id, { y: Number(e.target.value) })}
            />
          </Box>

          {/* Size */}
          {el.$type !== 'arrow' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label={t('properties.size') + ' W'}
                type="number"
                size="small"
                value={Math.round(el.width)}
                onChange={(e) => update(el.id, { width: Number(e.target.value) })}
              />
              <TextField
                label="H"
                type="number"
                size="small"
                value={Math.round(el.height)}
                onChange={(e) => update(el.id, { height: Number(e.target.value) })}
              />
            </Box>
          )}

          <Divider />

          {/* Shape-specific */}
          {el.$type === 'shape' && (() => {
            const shape = el as ShapeElement;
            return (
            <>
              <TextField
                label={t('properties.label')}
                size="small"
                value={shape.label ?? ''}
                onChange={(e) => update(el.id, { label: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={shape.labelFontSize == null}
                    onChange={(e) => {
                      update(el.id, e.target.checked
                        ? { labelFontSize: null }
                        : { labelFontSize: Math.round(resolveLabelFontSize(shape)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {shape.labelFontSize != null && (
                <NumericSliderField
                  label={t('properties.fontSize')}
                  value={Math.round(shape.labelFontSize ?? getDefaultLabelFontSize(shape))}
                  min={8}
                  max={200}
                  onChange={(value) => update(el.id, { labelFontSize: value })}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={shape.fontFamily ?? FONT_FAMILY_DEFAULT}
                onChange={(e) => update(el.id, { fontFamily: e.target.value === FONT_FAMILY_DEFAULT ? null : e.target.value })}
              >
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Box sx={{ fontFamily: option.previewFamily ?? 'inherit' }}>{option.label === 'Theme Default' ? t('properties.defaultFont') : option.label}</Box>
                  </MenuItem>
                ))}
              </TextField>
              <ColorInputField
                label={t('properties.color')}
                value={shape.labelColor ?? contrastingTextColor(shape.fillColor ?? '#ffffff')}
                onChange={(value) => update(el.id, { labelColor: value })}
              />
              <AlignmentControls
                horizontal={shape.labelHorizontalAlignment ?? HorizontalLabelAlignment.Center}
                vertical={shape.labelVerticalAlignment ?? VerticalLabelAlignment.Middle}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={(value) => update(el.id, { labelVerticalAlignment: value })}
              />
              <TextStyleControls
                element={shape}
                onChange={(changes) => update(el.id, changes)}
              />
              <ColorInputField
                label={t('properties.fillColor')}
                value={shape.fillColor ?? '#ffffff'}
                onChange={(value) => update(el.id, { fillColor: value })}
              />
              <ColorInputField
                label={t('properties.strokeColor')}
                value={shape.strokeColor ?? '#333333'}
                onChange={(value) => update(el.id, { strokeColor: value })}
              />
              <NumericSliderField
                label={t('properties.strokeWidth')}
                value={shape.strokeWidth ?? 2}
                min={0}
                max={20}
                onChange={(value) => update(el.id, { strokeWidth: value })}
              />
              <PreviewSelect
                label={t('properties.lineStyle')}
                value={shape.borderLineStyle ?? BorderLineStyle.Solid}
                options={borderStyleOptions}
                onChange={(value) => update(el.id, { borderLineStyle: value as ShapeElement['borderLineStyle'] })}
              />
            </>
            );
          })()}

          {/* Text-specific */}
          {el.$type === 'text' && (() => {
            const text = el as TextElement;
            return (
            <>
              <TextField
                label={t('properties.text')}
                size="small"
                multiline
                minRows={3}
                value={text.text ?? ''}
                onChange={(e) => update(el.id, { text: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={text.autoFontSize ?? false}
                    onChange={(e) => {
                      update(el.id, e.target.checked
                        ? { autoFontSize: true }
                        : { autoFontSize: false, fontSize: Math.round(resolveTextFontSize(text)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {!text.autoFontSize && (
                <NumericSliderField
                  label={t('properties.fontSize')}
                  value={Math.round(text.fontSize ?? 18)}
                  min={8}
                  max={200}
                  onChange={(value) => update(el.id, { fontSize: value, autoFontSize: false })}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={text.fontFamily ?? FONT_FAMILY_DEFAULT}
                onChange={(e) => update(el.id, { fontFamily: e.target.value === FONT_FAMILY_DEFAULT ? null : e.target.value })}
              >
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Box sx={{ fontFamily: option.previewFamily ?? 'inherit' }}>{option.label === 'Theme Default' ? t('properties.defaultFont') : option.label}</Box>
                  </MenuItem>
                ))}
              </TextField>
              <ColorInputField
                label={t('properties.color')}
                value={text.color ?? '#333333'}
                onChange={(value) => update(el.id, { color: value })}
              />
              <AlignmentControls
                horizontal={text.labelHorizontalAlignment ?? HorizontalLabelAlignment.Left}
                vertical={text.labelVerticalAlignment ?? VerticalLabelAlignment.Top}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={(value) => update(el.id, { labelVerticalAlignment: value })}
              />
              <TextStyleControls
                element={text}
                onChange={(changes) => update(el.id, changes)}
              />
            </>
            );
          })()}

          {el.$type === 'sticky' && (() => {
            const sticky = el as StickyNoteElement;
            return (
            <>
              <TextField
                label={t('properties.text')}
                size="small"
                multiline
                minRows={4}
                value={sticky.text ?? ''}
                onChange={(e) => update(el.id, { text: e.target.value })}
              />
              <ColorInputField
                label={t('properties.fillColor')}
                value={sticky.fillColor ?? '#FDE68A'}
                onChange={(value) => {
                  const fallbackColor = contrastingTextColor(sticky.fillColor ?? '#FDE68A');
                  const currentColor = sticky.color ?? fallbackColor;
                  update(el.id, currentColor === fallbackColor
                    ? { fillColor: value, color: contrastingTextColor(value) }
                    : { fillColor: value });
                }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={sticky.autoFontSize ?? false}
                    onChange={(e) => {
                      update(el.id, e.target.checked
                        ? { autoFontSize: true }
                        : { autoFontSize: false, fontSize: Math.round(resolveTextFontSize(sticky)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {!sticky.autoFontSize && (
                <NumericSliderField
                  label={t('properties.fontSize')}
                  value={Math.round(sticky.fontSize ?? 16)}
                  min={8}
                  max={200}
                  onChange={(value) => update(el.id, { fontSize: value, autoFontSize: false })}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={sticky.fontFamily ?? FONT_FAMILY_DEFAULT}
                onChange={(e) => update(el.id, { fontFamily: e.target.value === FONT_FAMILY_DEFAULT ? null : e.target.value })}
              >
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Box sx={{ fontFamily: option.previewFamily ?? 'inherit' }}>{option.label === 'Theme Default' ? t('properties.defaultFont') : option.label}</Box>
                  </MenuItem>
                ))}
              </TextField>
              <ColorInputField
                label={t('properties.color')}
                value={sticky.color ?? contrastingTextColor(sticky.fillColor ?? '#FDE68A')}
                onChange={(value) => update(el.id, { color: value })}
              />
              <AlignmentControls
                horizontal={sticky.labelHorizontalAlignment ?? HorizontalLabelAlignment.Left}
                vertical={sticky.labelVerticalAlignment ?? VerticalLabelAlignment.Top}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={(value) => update(el.id, { labelVerticalAlignment: value })}
              />
              <TextStyleControls
                element={sticky}
                onChange={(changes) => update(el.id, changes)}
              />
            </>
            );
          })()}

          {el.$type === 'frame' && (() => {
            const frame = el as FrameElement;
            return (
            <>
              <TextField
                label={t('properties.label')}
                size="small"
                value={frame.label ?? ''}
                onChange={(e) => update(el.id, { label: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={frame.labelFontSize == null}
                    onChange={(e) => {
                      update(el.id, e.target.checked
                        ? { labelFontSize: null }
                        : { labelFontSize: Math.round(resolveFrameTitleFontSize(frame)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {frame.labelFontSize != null && (
                <NumericSliderField
                  label={t('properties.fontSize')}
                  value={Math.round(frame.labelFontSize ?? resolveFrameTitleFontSize(frame))}
                  min={8}
                  max={64}
                  onChange={(value) => update(el.id, { labelFontSize: value })}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={frame.fontFamily ?? FONT_FAMILY_DEFAULT}
                onChange={(e) => update(el.id, { fontFamily: e.target.value === FONT_FAMILY_DEFAULT ? null : e.target.value })}
              >
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Box sx={{ fontFamily: option.previewFamily ?? 'inherit' }}>{option.label === 'Theme Default' ? t('properties.defaultFont') : option.label}</Box>
                  </MenuItem>
                ))}
              </TextField>
              <ColorInputField
                label={t('properties.color')}
                value={frame.labelColor ?? contrastingTextColor(frame.fillColor ?? 'rgba(37, 99, 235, 0.08)')}
                onChange={(value) => update(el.id, { labelColor: value })}
              />
              <AlignmentControls
                horizontal={frame.labelHorizontalAlignment ?? HorizontalLabelAlignment.Left}
                vertical={VerticalLabelAlignment.Top}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={() => undefined}
                showVertical={false}
              />
              <TextStyleControls
                element={frame}
                onChange={(changes) => update(el.id, changes)}
              />
              <ColorInputField
                label={t('properties.fillColor')}
                value={frame.fillColor ?? 'rgba(37, 99, 235, 0.08)'}
                onChange={(value) => update(el.id, { fillColor: value })}
              />
              <ColorInputField
                label={t('properties.strokeColor')}
                value={frame.strokeColor ?? 'rgba(37, 99, 235, 0.48)'}
                onChange={(value) => update(el.id, { strokeColor: value })}
              />
              <NumericSliderField
                label={t('properties.strokeWidth')}
                value={frame.strokeWidth ?? 2}
                min={1}
                max={12}
                onChange={(value) => update(el.id, { strokeWidth: value })}
              />
            </>
            );
          })()}

          {el.$type === 'icon' && (() => {
            const icon = el as IconElement;
            return (
            <>
              <TextField
                label={t('tools.icon')}
                size="small"
                value={getIconDisplayName(icon.iconName)}
                slotProps={{ input: { readOnly: true } }}
              />
              <ColorInputField
                label={t('properties.color')}
                value={icon.color ?? '#333333'}
                onChange={(value) => update(el.id, { color: value })}
              />
            </>
            );
          })()}

          {/* Image-specific */}
          {el.$type === 'image' && (() => {
            const image = el as ImageElement;
            return (
            <>
              <NumericSliderField
                label={t('properties.opacity')}
                value={Math.round((image.opacity ?? 1) * 100)}
                min={10}
                max={100}
                onChange={(value) => update(el.id, { opacity: value / 100 })}
              />
              <TextField
                select
                size="small"
                label={t('properties.imageFit')}
                value={image.imageFit ?? ImageFit.Uniform}
                onChange={(e) => { void handleImageFitChange(el.id, e.target.value as ImageFit); }}
                fullWidth
              >
                <MenuItem value={ImageFit.Uniform}>{t('properties.imageFit_Uniform')}</MenuItem>
                <MenuItem value={ImageFit.UniformToFill}>{t('properties.imageFit_UniformToFill')}</MenuItem>
                <MenuItem value={ImageFit.Fill}>{t('properties.imageFit_Fill')}</MenuItem>
              </TextField>
            </>
            );
          })()}

          {/* Arrow-specific */}
          {el.$type === 'arrow' && (() => {
            const arrow = el as ArrowElement;
            return (
            <>
              <ColorInputField
                label={t('properties.strokeColor')}
                value={arrow.strokeColor ?? '#333333'}
                onChange={(value) => update(el.id, { strokeColor: value })}
              />
              <NumericSliderField
                label={t('properties.strokeWidth')}
                value={arrow.strokeWidth ?? 2}
                min={1}
                max={20}
                onChange={(value) => update(el.id, { strokeWidth: value })}
              />
              <PreviewSelect
                label={t('properties.lineStyle')}
                value={arrow.lineStyle ?? ArrowLineStyle.Solid}
                options={arrowLineStyleOptions}
                onChange={(value) => update(el.id, { lineStyle: value as ArrowElement['lineStyle'] })}
              />
              <TextField
                select
                label={t('properties.sourceDock')}
                size="small"
                value={arrow.sourceDock ?? DockPoint.Center}
                onChange={(e) => update(el.id, { sourceDock: e.target.value as DockPoint })}
              >
                {dockOptions.map((dock) => (
                  <MenuItem key={`source-${dock}`} value={dock}>{dock}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('properties.targetDock')}
                size="small"
                value={arrow.targetDock ?? DockPoint.Center}
                onChange={(e) => update(el.id, { targetDock: e.target.value as DockPoint })}
              >
                {dockOptions.map((dock) => (
                  <MenuItem key={`target-${dock}`} value={dock}>{dock}</MenuItem>
                ))}
              </TextField>
              <PreviewSelect
                label={t('properties.sourceHead')}
                value={arrow.sourceHeadStyle ?? ArrowHeadStyle.None}
                options={sourceHeadOptions}
                onChange={(value) => update(el.id, { sourceHeadStyle: value as ArrowElement['sourceHeadStyle'] })}
              />
              <PreviewSelect
                label={t('properties.targetHead')}
                value={arrow.targetHeadStyle ?? ArrowHeadStyle.FilledTriangle}
                options={targetHeadOptions}
                onChange={(value) => update(el.id, { targetHeadStyle: value as ArrowElement['targetHeadStyle'] })}
              />
              <TextField
                select
                label={t('properties.routeStyle')}
                size="small"
                value={arrow.routeStyle ?? 'Orthogonal'}
                onChange={(e) => update(el.id, { routeStyle: e.target.value as ArrowElement['routeStyle'] })}
              >
                <MenuItem value="Straight">{t('properties.straight')}</MenuItem>
                <MenuItem value="Orthogonal">{t('properties.orthogonal')}</MenuItem>
              </TextField>
            </>
            );
          })()}
        </Box>
      )}
    </Paper>
  );
});

