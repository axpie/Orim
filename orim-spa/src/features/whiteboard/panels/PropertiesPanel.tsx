import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Divider,
  IconButton,
  Paper,
  TextField,
  MenuItem,
  FormControlLabel,
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
import {
  ArrowLineStyle,
  ArrowHeadStyle,
  BorderLineStyle,
  DockPoint,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type BoardElement,
  type BoardElementBase,
  type ShapeElement,
  type TextElement,
  type ArrowElement,
  type IconElement,
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
}: {
  horizontal: HorizontalLabelAlignment;
  vertical: VerticalLabelAlignment;
  horizontalLabel: string;
  verticalLabel: string;
  onHorizontalChange: (value: HorizontalLabelAlignment) => void;
  onVerticalChange: (value: VerticalLabelAlignment) => void;
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
    </Box>
  );
}

interface PropertiesPanelProps {
  onClose: () => void;
  onBoardChanged?: (changeKind: string) => void;
}

export function PropertiesPanel({ onClose, onBoardChanged }: PropertiesPanelProps) {
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
    const before = [...elements];
    updateElement(id, changes);
    const after = elements.map((element: BoardElement) =>
      element.id === id ? { ...element, ...changes } : element,
    ) as BoardElement[];
    pushCommand(before, after);
    setDirty(true);
    onBoardChanged?.('edit');
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: 280,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        borderRadius: 0,
        borderLeft: (theme) => `1px solid ${theme.palette.divider}`,
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
          {el.$type === 'shape' && (
            <>
              <TextField
                label={t('properties.label')}
                size="small"
                value={(el as ShapeElement).label ?? ''}
                onChange={(e) => update(el.id, { label: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={(el as ShapeElement).labelFontSize == null}
                    onChange={(e) => {
                      const shape = el as ShapeElement;
                      update(el.id, e.target.checked
                        ? { labelFontSize: null }
                        : { labelFontSize: Math.round(resolveLabelFontSize(shape)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {(el as ShapeElement).labelFontSize != null && (
                <TextField
                  label={t('properties.fontSize')}
                  type="number"
                  size="small"
                  value={Math.round((el as ShapeElement).labelFontSize ?? getDefaultLabelFontSize(el as ShapeElement))}
                  onChange={(e) => update(el.id, { labelFontSize: Number(e.target.value) })}
                  inputProps={{ min: 8, max: 200 }}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={(el as ShapeElement).fontFamily ?? FONT_FAMILY_DEFAULT}
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
                value={(el as ShapeElement).labelColor ?? contrastingTextColor((el as ShapeElement).fillColor ?? '#ffffff')}
                onChange={(value) => update(el.id, { labelColor: value })}
              />
              <AlignmentControls
                horizontal={(el as ShapeElement).labelHorizontalAlignment ?? HorizontalLabelAlignment.Center}
                vertical={(el as ShapeElement).labelVerticalAlignment ?? VerticalLabelAlignment.Middle}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={(value) => update(el.id, { labelVerticalAlignment: value })}
              />
              <TextStyleControls
                element={el as ShapeElement}
                onChange={(changes) => update(el.id, changes)}
              />
              <ColorInputField
                label={t('properties.fillColor')}
                value={(el as ShapeElement).fillColor ?? '#ffffff'}
                onChange={(value) => update(el.id, { fillColor: value })}
              />
              <ColorInputField
                label={t('properties.strokeColor')}
                value={(el as ShapeElement).strokeColor ?? '#333333'}
                onChange={(value) => update(el.id, { strokeColor: value })}
              />
              <TextField
                label={t('properties.strokeWidth')}
                type="number"
                size="small"
                value={(el as ShapeElement).strokeWidth ?? 2}
                onChange={(e) => update(el.id, { strokeWidth: Number(e.target.value) })}
                inputProps={{ min: 0, max: 20 }}
              />
              <PreviewSelect
                label={t('properties.lineStyle')}
                value={(el as ShapeElement).borderLineStyle ?? BorderLineStyle.Solid}
                options={borderStyleOptions}
                onChange={(value) => update(el.id, { borderLineStyle: value as ShapeElement['borderLineStyle'] })}
              />
            </>
          )}

          {/* Text-specific */}
          {el.$type === 'text' && (
            <>
              <TextField
                label={t('properties.text')}
                size="small"
                multiline
                minRows={3}
                value={(el as TextElement).text ?? ''}
                onChange={(e) => update(el.id, { text: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={(el as TextElement).autoFontSize ?? false}
                    onChange={(e) => {
                      const textElement = el as TextElement;
                      update(el.id, e.target.checked
                        ? { autoFontSize: true }
                        : { autoFontSize: false, fontSize: Math.round(resolveTextFontSize(textElement)) });
                    }}
                    size="small"
                  />
                }
                label={t('properties.automaticFontSize')}
              />
              {!(el as TextElement).autoFontSize && (
                <TextField
                  label={t('properties.fontSize')}
                  type="number"
                  size="small"
                  value={Math.round((el as TextElement).fontSize ?? 18)}
                  onChange={(e) => update(el.id, { fontSize: Number(e.target.value), autoFontSize: false })}
                  inputProps={{ min: 8, max: 200 }}
                />
              )}
              <TextField
                select
                label={t('properties.fontFamily')}
                size="small"
                value={(el as TextElement).fontFamily ?? FONT_FAMILY_DEFAULT}
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
                value={(el as TextElement).color ?? '#333333'}
                onChange={(value) => update(el.id, { color: value })}
              />
              <AlignmentControls
                horizontal={(el as TextElement).labelHorizontalAlignment ?? HorizontalLabelAlignment.Left}
                vertical={(el as TextElement).labelVerticalAlignment ?? VerticalLabelAlignment.Top}
                horizontalLabel={t('properties.horizontal')}
                verticalLabel={t('properties.vertical')}
                onHorizontalChange={(value) => update(el.id, { labelHorizontalAlignment: value })}
                onVerticalChange={(value) => update(el.id, { labelVerticalAlignment: value })}
              />
              <TextStyleControls
                element={el as TextElement}
                onChange={(changes) => update(el.id, changes)}
              />
            </>
          )}

          {el.$type === 'icon' && (
            <>
              <TextField
                label={t('tools.icon')}
                size="small"
                value={getIconDisplayName((el as IconElement).iconName)}
                slotProps={{ input: { readOnly: true } }}
              />
              <ColorInputField
                label={t('properties.color')}
                value={(el as IconElement).color ?? '#333333'}
                onChange={(value) => update(el.id, { color: value })}
              />
            </>
          )}

          {/* Arrow-specific */}
          {el.$type === 'arrow' && (
            <>
              <ColorInputField
                label={t('properties.strokeColor')}
                value={(el as ArrowElement).strokeColor ?? '#333333'}
                onChange={(value) => update(el.id, { strokeColor: value })}
              />
              <TextField
                label={t('properties.strokeWidth')}
                type="number"
                size="small"
                value={(el as ArrowElement).strokeWidth ?? 2}
                onChange={(e) => update(el.id, { strokeWidth: Number(e.target.value) })}
                inputProps={{ min: 1, max: 20 }}
              />
              <PreviewSelect
                label={t('properties.lineStyle')}
                value={(el as ArrowElement).lineStyle ?? ArrowLineStyle.Solid}
                options={arrowLineStyleOptions}
                onChange={(value) => update(el.id, { lineStyle: value as ArrowElement['lineStyle'] })}
              />
              <TextField
                select
                label={t('properties.sourceDock')}
                size="small"
                value={(el as ArrowElement).sourceDock ?? DockPoint.Center}
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
                value={(el as ArrowElement).targetDock ?? DockPoint.Center}
                onChange={(e) => update(el.id, { targetDock: e.target.value as DockPoint })}
              >
                {dockOptions.map((dock) => (
                  <MenuItem key={`target-${dock}`} value={dock}>{dock}</MenuItem>
                ))}
              </TextField>
              <PreviewSelect
                label={t('properties.sourceHead')}
                value={(el as ArrowElement).sourceHeadStyle ?? ArrowHeadStyle.None}
                options={sourceHeadOptions}
                onChange={(value) => update(el.id, { sourceHeadStyle: value as ArrowElement['sourceHeadStyle'] })}
              />
              <PreviewSelect
                label={t('properties.targetHead')}
                value={(el as ArrowElement).targetHeadStyle ?? ArrowHeadStyle.FilledTriangle}
                options={targetHeadOptions}
                onChange={(value) => update(el.id, { targetHeadStyle: value as ArrowElement['targetHeadStyle'] })}
              />
              <TextField
                select
                label={t('properties.routeStyle')}
                size="small"
                value={(el as ArrowElement).routeStyle ?? 'Orthogonal'}
                onChange={(e) => update(el.id, { routeStyle: e.target.value as ArrowElement['routeStyle'] })}
              >
                <MenuItem value="Straight">{t('properties.straight')}</MenuItem>
                <MenuItem value="Orthogonal">{t('properties.orthogonal')}</MenuItem>
              </TextField>
            </>
          )}
        </Box>
      )}
    </Paper>
  );
}
