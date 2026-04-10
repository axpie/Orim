import React, { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  ButtonBase,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Divider,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  SvgIcon,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { type SxProps, type Theme, useTheme } from '@mui/material/styles';
import { mdiLayersOutline } from '@mdi/js';
import NearMeIcon from '@mui/icons-material/NearMe';
import PanToolIcon from '@mui/icons-material/PanTool';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import WebAssetOutlinedIcon from '@mui/icons-material/WebAssetOutlined';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import DrawIcon from '@mui/icons-material/Draw';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CropFreeIcon from '@mui/icons-material/CropFree';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import MapIcon from '@mui/icons-material/Map';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ConstructionIcon from '@mui/icons-material/Construction';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import {
  filterIconDefinitions,
  ICON_GROUP_DEFINITIONS,
  getEnabledIconGroupDefinitions,
  getIconDefinition,
  type IconDefinition,
  type IconGroupKey,
} from '../icons/iconCatalog';
import { FileLibraryDialog } from '../FileLibraryDialog';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import {
  asOperationPayload,
  createElementAddedOperation,
  createBoardMetadataUpdatedOperation,
  createElementsDeletedOperation,
  createElementUpdatedOperation,
} from '../realtime/boardOperations';
import {
  createChangedKeysByElementId,
  createAddElementsCommand,
  createDeleteElementsCommand,
  createElementUpdateCommand,
} from '../realtime/localBoardCommands';
import { useBoardStore, type ToolType } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { useWhiteboardColorPalette } from '../controls/useWhiteboardColorPalette';
import { type Rect } from '../../../utils/geometry';
import { ArrowRouteStyle, HorizontalLabelAlignment, VerticalLabelAlignment, ImageFit, type FrameElement, type FileElement } from '../../../types/models';
import type { BoardFileInfo } from '../../../types/models';
import { getEffectiveStickyNotePresets } from '../stickyNotePresets';
import { canDeleteSelection } from '../selectionLocking';
import { ZOrderMenuItems } from '../ZOrderMenuItems';
import { StylePresetDialog } from '../presets/StylePresetDialog';
import { useStylePresetStore } from '../presets/stylePresetStore';
import { getStylePresetTypeForTool } from '../presets/stylePresetUtils';
import {
  applyZOrderAction,
  getZOrderAvailability,
  type ZOrderAction,
} from '../zOrder';
import { getBoundsForElements, getElementBounds, getFitToScreenViewport } from '../cameraUtils';
import { FALLBACK_BOARD_DEFAULTS } from '../canvas/canvasUtils';
import { getDefaultFrameColors } from '../shapes/frameStyle';
import { v4 as uuidv4 } from 'uuid';

interface ToolbarProps {
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  /** Ref to the canvas container element, used for accurate fit-to-screen viewport measurement. */
  canvasContainerRef?: React.RefObject<HTMLElement | null>;
  minimapVisible?: boolean;
  onToggleMinimap?: () => void;
  shareToken?: string;
  sharePassword?: string | null;
}

const FRAME_WRAP_HORIZONTAL_PADDING = 24;
const FRAME_WRAP_TOP_PADDING = 56;
const FRAME_WRAP_BOTTOM_PADDING = 24;

function ArrowRouteIcon({ routeStyle }: { routeStyle: ArrowRouteStyle }) {
  const path = routeStyle === ArrowRouteStyle.Straight
    ? 'M5 12H18M14 8l4 4-4 4'
    : routeStyle === ArrowRouteStyle.Orthogonal
      ? 'M5 17V8H18M14 4l4 4-4 4'
      : 'M5 18C5 11 9 7 15 7H18M14 3l4 4-4 4';

  return (
    <SvgIcon fontSize="small" viewBox="0 0 24 24">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function CatalogIconGlyph({
  icon,
  fontSize = 'small',
  sx,
}: {
  icon: NonNullable<ReturnType<typeof getIconDefinition>>;
  fontSize?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}) {
  return (
    <SvgIcon fontSize={fontSize} sx={sx}>
      {icon.nodes.map((node, index) => {
        switch (node.type) {
          case 'path':
            return <path key={`path-${index}`} d={node.d} fill="currentColor" opacity={node.opacity} />;
          case 'circle':
            return <circle key={`circle-${index}`} cx={node.cx} cy={node.cy} r={node.r} fill="currentColor" opacity={node.opacity} />;
          case 'ellipse':
            return <ellipse key={`ellipse-${index}`} cx={node.cx} cy={node.cy} rx={node.rx} ry={node.ry} fill="currentColor" opacity={node.opacity} />;
          default:
            return null;
        }
      })}
    </SvgIcon>
  );
}

const ICON_PICKER_ITEM_MIN_WIDTH = 88;
const ICON_PICKER_ITEM_HEIGHT = 96;
const ICON_PICKER_GAP = 8;
const ICON_PICKER_DEFAULT_HEIGHT = 640;
const ICON_PICKER_OVERSCAN_ROWS = 2;

function IconPickerGrid({
  icons,
  onSelect,
}: {
  icons: IconDefinition[];
  onSelect: (iconName: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [containerHeight, setContainerHeight] = useState(ICON_PICKER_DEFAULT_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateMeasurements = () => {
      setContainerWidth(container.clientWidth || 720);
      setContainerHeight(container.clientHeight || ICON_PICKER_DEFAULT_HEIGHT);
    };

    updateMeasurements();

    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(container);

    return () => observer.disconnect();
  }, [icons.length]);

  if (icons.length === 0) {
    return (
      <Box
        ref={containerRef}
        sx={{
          maxHeight: 'min(70vh, 640px)',
          height: 'min(70vh, 640px)',
          overflowY: 'auto',
        }}
      />
    );
  }

  const columns = Math.max(1, Math.floor((containerWidth + ICON_PICKER_GAP) / (ICON_PICKER_ITEM_MIN_WIDTH + ICON_PICKER_GAP)));
  const itemWidth = Math.max(
    ICON_PICKER_ITEM_MIN_WIDTH,
    (containerWidth - ICON_PICKER_GAP * Math.max(columns - 1, 0)) / columns,
  );
  const rowHeight = ICON_PICKER_ITEM_HEIGHT + ICON_PICKER_GAP;
  const totalRows = Math.ceil(icons.length / columns);
  const viewportHeight = Math.max(containerHeight, ICON_PICKER_ITEM_HEIGHT);
  const totalHeight = totalRows > 0 ? totalRows * rowHeight - ICON_PICKER_GAP : 0;
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight));
  const startRow = Math.max(0, Math.floor(effectiveScrollTop / rowHeight) - ICON_PICKER_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows - 1,
    Math.ceil((effectiveScrollTop + viewportHeight) / rowHeight) + ICON_PICKER_OVERSCAN_ROWS,
  );
  const startIndex = startRow * columns;
  const endIndex = Math.min(icons.length, (endRow + 1) * columns);
  const visibleIcons = icons.slice(startIndex, endIndex);

  return (
    <Box
      ref={containerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      sx={{
        maxHeight: 'min(70vh, 640px)',
        height: 'min(70vh, 640px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Box sx={{ position: 'relative', height: totalHeight }}>
        {visibleIcons.map((icon, index) => {
          const actualIndex = startIndex + index;
          const row = Math.floor(actualIndex / columns);
          const column = actualIndex % columns;

          return (
            <ButtonBase
              key={icon.name}
              onClick={() => onSelect(icon.name)}
              sx={{
                position: 'absolute',
                top: row * rowHeight,
                left: column * (itemWidth + ICON_PICKER_GAP),
                width: itemWidth,
                boxSizing: 'border-box',
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 1.5,
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                minHeight: ICON_PICKER_ITEM_HEIGHT,
              }}
            >
              <CatalogIconGlyph icon={icon} sx={{ fontSize: 28 }} />
              <Typography variant="caption" textAlign="center">
                {icon.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function isRectContained(frame: Pick<FrameElement, 'x' | 'y' | 'width' | 'height'>, bounds: Rect): boolean {
  return bounds.x >= frame.x
    && bounds.y >= frame.y
    && bounds.x + bounds.width <= frame.x + frame.width
    && bounds.y + bounds.height <= frame.y + frame.height;
}

function createFrameRect(bounds: Rect): Rect {
  return {
    x: bounds.x - FRAME_WRAP_HORIZONTAL_PADDING,
    y: bounds.y - FRAME_WRAP_TOP_PADDING,
    width: bounds.width + FRAME_WRAP_HORIZONTAL_PADDING * 2,
    height: bounds.height + FRAME_WRAP_TOP_PADDING + FRAME_WRAP_BOTTOM_PADDING,
  };
}

export const Toolbar = React.memo(function Toolbar({ onBoardChanged, canvasContainerRef, minimapVisible, onToggleMinimap, shareToken, sharePassword }: ToolbarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const isMediumDown = useMediaQuery(theme.breakpoints.down('md'));
  const isCompactLayout = isTouchDevice || isMediumDown;
  const activeTool = useBoardStore((s) => s.activeTool);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const zoom = useBoardStore((s) => s.zoom);
  const setZoom = useBoardStore((s) => s.setZoom);
  const setCamera = useBoardStore((s) => s.setCamera);
  const viewportWidth = useBoardStore((s) => s.viewportWidth);
  const viewportHeight = useBoardStore((s) => s.viewportHeight);
  const viewportInsets = useBoardStore((s) => s.viewportInsets);
  const selectedIds = useBoardStore((s) => s.selectedElementIds);
  const removeElements = useBoardStore((s) => s.removeElements);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const addElement = useBoardStore((s) => s.addElement);
  const updateElement = useBoardStore((s) => s.updateElement);
  const setPendingIconName = useBoardStore((s) => s.setPendingIconName);
  const pendingArrowRouteStyle = useBoardStore((s) => s.pendingArrowRouteStyle);
  const setPendingArrowRouteStyle = useBoardStore((s) => s.setPendingArrowRouteStyle);
  const board = useBoardStore((s) => s.board);
  const setElements = useBoardStore((s) => s.setElements);
  const applyLocalCommand = useBoardStore((s) => s.applyLocalCommand);
  const setDirty = useBoardStore((s) => s.setDirty);
  const pendingStickyNotePresetId = useBoardStore((s) => s.pendingStickyNotePresetId);
  const setPendingStickyNotePresetId = useBoardStore((s) => s.setPendingStickyNotePresetId);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);
  const stylePresets = useStylePresetStore((state) => state.presets);
  const stylePresetPlacementPreferences = useStylePresetStore((state) => state.placementPreferences);
  const setPlacementMode = useStylePresetStore((state) => state.setPlacementMode);
  const setDefaultPreset = useStylePresetStore((state) => state.setDefaultPreset);
  const { activeTheme } = useWhiteboardColorPalette();
  const rawBoardDefaults = activeTheme?.boardDefaults ?? FALLBACK_BOARD_DEFAULTS;
  const boardSurfaceColor = board?.surfaceColor ?? null;
  const boardDefaults = boardSurfaceColor
    ? { ...rawBoardDefaults, surfaceColor: boardSurfaceColor }
    : rawBoardDefaults;
  const defaultFrameColors = getDefaultFrameColors(boardDefaults);

  const canUndo = useCommandStack((s) => s.canUndo);
  const canRedo = useCommandStack((s) => s.canRedo);
  const peekUndo = useCommandStack((s) => s.peekUndo);
  const commitUndo = useCommandStack((s) => s.commitUndo);
  const peekRedo = useCommandStack((s) => s.peekRedo);
  const commitRedo = useCommandStack((s) => s.commitRedo);
  const pushCommand = useCommandStack((s) => s.push);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const [arrangeAnchorEl, setArrangeAnchorEl] = useState<HTMLElement | null>(null);
  const [shapeAnchorEl, setShapeAnchorEl] = useState<HTMLElement | null>(null);
  const [arrowAnchorEl, setArrowAnchorEl] = useState<HTMLElement | null>(null);
  const [iconGroupAnchorEl, setIconGroupAnchorEl] = useState<HTMLElement | null>(null);
  const [stickyPresetAnchorEl, setStickyPresetAnchorEl] = useState<HTMLElement | null>(null);
  const [stylePresetAnchorEl, setStylePresetAnchorEl] = useState<HTMLElement | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [requestedIconGroupKey, setRequestedIconGroupKey] = useState<'all' | IconGroupKey>('all');
  const [compactCollapsed, setCompactCollapsed] = useState(isCompactLayout);
  const [stylePresetDialogOpen, setStylePresetDialogOpen] = useState(false);

  // Refs for ResizeObserver-based two-column detection
  const paperRef = useRef<HTMLDivElement | null>(null);
  const singleColMeasureRef = useRef<HTMLDivElement | null>(null);
  const [twoColumnsDetected, setTwoColumnsDetected] = useState(false);
  // Derived: always false when compact (no setState needed for the compact reset)
  const twoColumns = !isCompactLayout && twoColumnsDetected;

  // Compare the natural single-column height (from the hidden measure element) to the
  // Paper's visible height. When the content would overflow, switch to two columns.
  // This is pure JS so it works in all browsers (the CSS flex-wrap approach is
  // unreliable in Firefox/Safari for column-direction containers).
  useEffect(() => {
    if (isCompactLayout || !paperRef.current) return;
    const paper = paperRef.current;
    const observer = new ResizeObserver(() => {
      const measure = singleColMeasureRef.current;
      if (!measure) return;
      setTwoColumnsDetected(measure.offsetHeight > paper.clientHeight + 4);
    });
    observer.observe(paper);
    return () => observer.disconnect();
  }, [isCompactLayout]);

  const selectedElements = useMemo(
    () => board?.elements.filter((element) => selectedIds.includes(element.id)) ?? [],
    [board?.elements, selectedIds],
  );
  const selectedGroupIds = useMemo(
    () => new Set(selectedElements.flatMap((element) => element.groupId ? [element.groupId] : [])),
    [selectedElements],
  );
  const selectedFrames = useMemo(
    () => selectedElements.filter((element): element is FrameElement => element.$type === 'frame'),
    [selectedElements],
  );
  const selectedNonFrames = useMemo(
    () => selectedElements.filter((element) => element.$type !== 'frame'),
    [selectedElements],
  );
  const selectedFrame = selectedFrames.length === 1 ? selectedFrames[0] : null;
  const enclosedContentForSelectedFrame = useMemo(() => {
    if (!board || !selectedFrame || selectedNonFrames.length > 0) {
      return [];
    }

    return board.elements.filter((element) => {
      if (element.id === selectedFrame.id || element.$type === 'frame') {
        return false;
      }

      const bounds = getElementBounds(element, board.elements);
      return bounds != null && isRectContained(selectedFrame, bounds);
    });
  }, [board, selectedFrame, selectedNonFrames]);
  const fitFrameTargets = selectedFrame
    ? (selectedNonFrames.length > 0 ? selectedNonFrames : enclosedContentForSelectedFrame)
    : selectedNonFrames;
  const fitFrameBounds = useMemo(
    () => board ? getBoundsForElements(fitFrameTargets, board.elements) : null,
    [board, fitFrameTargets],
  );
  const canGroup = selectedElements.length >= 2;
  const canUngroup = selectedGroupIds.size > 0;
  const canFitFrameSelection = selectedFrames.length <= 1 && fitFrameBounds != null;
  const canDeleteCurrentSelection = canDeleteSelection(selectedElements);
  const zOrderAvailability = useMemo(
    () => board ? getZOrderAvailability(board.elements, selectedIds) : {
      'bring-to-front': false,
      'bring-forward': false,
      'send-backward': false,
      'send-to-back': false,
    },
    [board, selectedIds],
  );

  const collapsed = isCompactLayout ? compactCollapsed : false;

  const enabledIconGroups = useMemo(
    () => getEnabledIconGroupDefinitions(board?.enabledIconGroups),
    [board?.enabledIconGroups],
  );
  const hasEnabledIconGroups = enabledIconGroups.length > 0;
  const activeIconGroupKey = requestedIconGroupKey;
  const filteredIcons = useMemo(
    () => activeIconGroupKey === 'all'
      ? filterIconDefinitions(iconSearch)
      : filterIconDefinitions(iconSearch, { activeGroupKey: activeIconGroupKey }),
    [activeIconGroupKey, iconSearch],
  );
  const selectedIconGroup = activeIconGroupKey === 'all'
    ? null
    : ICON_GROUP_DEFINITIONS.find((group) => group.key === activeIconGroupKey) ?? null;
  const stickyNotePresets = useMemo(() => getEffectiveStickyNotePresets(board, t), [board, t]);
  const activeStickyPresetId = stickyNotePresets.some((preset) => preset.id === pendingStickyNotePresetId)
    ? pendingStickyNotePresetId
    : (stickyNotePresets[0]?.id ?? null);
  const arrowRouteOptions = useMemo(() => ([
    {
      routeStyle: ArrowRouteStyle.Straight,
      icon: <ArrowRouteIcon routeStyle={ArrowRouteStyle.Straight} />,
      label: t('tools.straightArrow', 'Gerader Pfeil'),
    },
    {
      routeStyle: ArrowRouteStyle.Orthogonal,
      icon: <ArrowRouteIcon routeStyle={ArrowRouteStyle.Orthogonal} />,
      label: t('tools.orthogonalArrow', 'Winkeliger Pfeil'),
    },
    {
      routeStyle: ArrowRouteStyle.Arc,
      icon: <ArrowRouteIcon routeStyle={ArrowRouteStyle.Arc} />,
      label: t('tools.curvedArrow', 'Gebogener Pfeil'),
    },
  ]), [t]);
  const activeArrowDescriptor = arrowRouteOptions.find((option) => option.routeStyle === pendingArrowRouteStyle) ?? arrowRouteOptions[1];

  const tools: Array<{ tool: ToolType; icon: ReactNode; label: string; shortcut?: string }> = [
    { tool: 'select', icon: <NearMeIcon />, label: t('tools.select'), shortcut: 'V' },
    { tool: 'hand', icon: <PanToolIcon />, label: t('tools.hand'), shortcut: 'H' },
    { tool: 'drawing', icon: <DrawIcon />, label: t('tools.drawing'), shortcut: 'D' },
    { tool: 'rectangle', icon: <RectangleOutlinedIcon />, label: t('tools.rectangle'), shortcut: 'R' },
    { tool: 'ellipse', icon: <CircleOutlinedIcon />, label: t('tools.ellipse') },
    { tool: 'triangle', icon: <ChangeHistoryIcon />, label: t('tools.triangle') },
    { tool: 'rhombus', icon: <RectangleOutlinedIcon sx={{ transform: 'rotate(45deg)' }} />, label: t('tools.rhombus') },
    { tool: 'text', icon: <TextFieldsIcon />, label: t('tools.text'), shortcut: 'T' },
    { tool: 'sticky', icon: <StickyNote2OutlinedIcon />, label: t('tools.stickyNote') },
    { tool: 'frame', icon: <WebAssetOutlinedIcon />, label: t('tools.frame') },
    {
      tool: 'icon',
      icon: <AddReactionIcon />,
      label: t('tools.icon'),
    },
    { tool: 'arrow', icon: activeArrowDescriptor.icon, label: t('tools.arrow'), shortcut: 'A' },
    { tool: 'image', icon: <PermMediaIcon />, label: t('tools.files') },
  ];
  const toolById = new Map(tools.map((tool) => [tool.tool, tool]));
  const shapeTools = tools.filter((tool) => tool.tool === 'rectangle' || tool.tool === 'ellipse' || tool.tool === 'triangle' || tool.tool === 'rhombus');
  const activeShapeTool = activeTool === 'ellipse' || activeTool === 'triangle' || activeTool === 'rhombus' || activeTool === 'rectangle'
    ? activeTool
    : 'rectangle';
  const activeShapeDescriptor = toolById.get(activeShapeTool) ?? shapeTools[0];
  const activeToolLabel = activeTool === 'arrow'
    ? activeArrowDescriptor.label
    : toolById.get(activeTool)?.label ?? t('tools.select');
  const activePresetType = getStylePresetTypeForTool(activeTool);
  const activePlacementPreference = activePresetType ? stylePresetPlacementPreferences[activePresetType] : null;
  const activeDefaultPreset = activePresetType && activePlacementPreference?.presetId
    ? stylePresets.find((preset) => preset.id === activePlacementPreference.presetId && preset.type === activePresetType) ?? null
    : null;
  const activePresetChoices = activePresetType
    ? stylePresets.filter((preset) => preset.type === activePresetType)
    : [];
  const activeStylePresetSummary = !activePresetType || !activePlacementPreference
    ? null
    : activePlacementPreference.mode === 'preset' && activeDefaultPreset
      ? activeDefaultPreset.name
      : t('stylePresets.themeDefault', 'Theme-Standard');

  const collapseCompactToolbarAfterAction = () => {
    if (isCompactLayout) {
      setCompactCollapsed(true);
    }
  };

  const emitPresetMetadataChange = () => {
    const currentBoard = useBoardStore.getState().board;
    if (!currentBoard) {
      return;
    }

    onBoardChanged?.('Metadata', createBoardMetadataUpdatedOperation(currentBoard));
  };

  const openIconPicker = (groupKey: 'all' | IconGroupKey) => {
    setRequestedIconGroupKey(groupKey);
    setIconSearch('');
    setIconGroupAnchorEl(null);
    setIconPickerOpen(true);
  };

  const handleToolClick = (event: MouseEvent<HTMLElement>, tool: ToolType) => {
    if (tool === 'icon') {
      if (!hasEnabledIconGroups) {
        openIconPicker('all');
        return;
      }

      setIconGroupAnchorEl(event.currentTarget);
      return;
    }

    if (tool === 'image') {
      setImageLibraryOpen(true);
      return;
    }

    if (tool === 'sticky') {
      setStickyPresetAnchorEl(event.currentTarget);
      return;
    }

    setActiveTool(tool);
    collapseCompactToolbarAfterAction();
  };

  const handleIconSelected = (iconName: string) => {
    setPendingIconName(iconName);
    setActiveTool('icon');
    setIconPickerOpen(false);
    setIconSearch('');
    collapseCompactToolbarAfterAction();
  };

  const handleStickyPresetSelected = (presetId: string) => {
    setPendingStickyNotePresetId(presetId);
    setActiveTool('sticky');
    setStickyPresetAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handleShapeSelected = (tool: ToolType) => {
    setActiveTool(tool);
    setShapeAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handleArrowRouteSelected = (routeStyle: ArrowRouteStyle) => {
    setPendingArrowRouteStyle(routeStyle);
    setActiveTool('arrow');
    setArrowAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handlePlacementModeSelected = (mode: 'theme-default') => {
    if (!activePresetType) {
      return;
    }

    setPlacementMode(activePresetType, mode);
    emitPresetMetadataChange();
    setStylePresetAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handleDefaultPresetSelected = (presetId: string) => {
    if (!activePresetType) {
      return;
    }

    setDefaultPreset(activePresetType, presetId);
    emitPresetMetadataChange();
    setStylePresetAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handleDelete = () => {
    if (!canDeleteCurrentSelection || !board) return;
    const deletedElements = board.elements.filter((element) => selectedIds.includes(element.id));
    if (deletedElements.length === 0) {
      return;
    }

    removeElements(selectedIds);
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    setDirty(true);
    onBoardChanged?.('delete', createElementsDeletedOperation(selectedIds));
    collapseCompactToolbarAfterAction();
  };

  const handleGroup = () => {
    if (!board || selectedElements.length < 2) return;

    const nextGroupId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const selectedIdSet = new Set(selectedElements.map((element) => element.id));
    const before = [...board.elements];
    const after = board.elements.map((element) => (
      selectedIdSet.has(element.id)
        ? { ...element, groupId: nextGroupId }
        : element
    ));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      before.filter((element) => selectedIdSet.has(element.id)),
      after.filter((element) => selectedIdSet.has(element.id)),
      createChangedKeysByElementId(selectedElements.map((element) => element.id), ['groupId']),
    ));
    setSelectedElementIds(after.filter((element) => element.groupId === nextGroupId).map((element) => element.id));
    setDirty(true);
    onBoardChanged?.('group', asOperationPayload(
      after
        .filter((element) => selectedIdSet.has(element.id))
        .map((element) => createElementUpdatedOperation(element)),
    ));
    collapseCompactToolbarAfterAction();
  };

  const handleUngroup = () => {
    if (!board || selectedGroupIds.size === 0) return;

    const before = [...board.elements];
    const affectedBefore = before.filter((element) => element.groupId && selectedGroupIds.has(element.groupId));
    const after = board.elements.map((element) => (
      element.groupId && selectedGroupIds.has(element.groupId)
        ? { ...element, groupId: null }
        : element
    ));
    const affectedAfter = after.filter((element) => affectedBefore.some((candidate) => candidate.id === element.id));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      affectedBefore,
      affectedAfter,
      createChangedKeysByElementId(affectedBefore.map((element) => element.id), ['groupId']),
    ));
    setSelectedElementIds(selectedIds.filter((id) => after.some((element) => element.id === id)));
    setDirty(true);
    onBoardChanged?.('ungroup', asOperationPayload(
      affectedAfter.map((element) => createElementUpdatedOperation(element)),
    ));
    collapseCompactToolbarAfterAction();
  };

  const handleZOrderAction = (action: ZOrderAction) => {
    if (!board) {
      return;
    }

    const result = applyZOrderAction(board.elements, selectedIds, action);
    if (result.changedIds.length === 0) {
      setArrangeAnchorEl(null);
      return;
    }

    const changedIdSet = new Set(result.changedIds);
    const before = board.elements.filter((element) => changedIdSet.has(element.id));
    const after = result.elements.filter((element) => changedIdSet.has(element.id));

    setElements(result.elements);
    pushCommand(createElementUpdateCommand(
      before,
      after,
      createChangedKeysByElementId(result.changedIds, ['zIndex']),
    ));
    setSelectedElementIds(result.effectiveSelectedIds);
    setDirty(true);
    onBoardChanged?.('zOrder', asOperationPayload(
      after.map((element) => createElementUpdatedOperation(element)),
    ));
    setArrangeAnchorEl(null);
    collapseCompactToolbarAfterAction();
  };

  const handleUndo = () => {
    const execution = peekUndo();
    if (!execution) {
      return;
    }

    const result = applyLocalCommand(execution);
    if (result.success) {
      commitUndo();
      if (result.operations.length > 0) {
        onBoardChanged?.('undo', asOperationPayload(result.operations));
      }
    }
  };

  const handleRedo = () => {
    const execution = peekRedo();
    if (!execution) {
      return;
    }

    const result = applyLocalCommand(execution);
    if (result.success) {
      commitRedo();
      if (result.operations.length > 0) {
        onBoardChanged?.('redo', asOperationPayload(result.operations));
      }
    }
  };

  const handleZoomIn = () => setZoom(Math.min(3.5, zoom * 1.2));
  const handleZoomOut = () => setZoom(Math.max(0.2, zoom / 1.2));

  const handleFitToScreen = () => {
    if (!board) {
      return;
    }

    // Prefer live DOM measurement to avoid using stale store values (e.g. from a
    // previously-maximised window that has since been resized).
    const containerRect = canvasContainerRef?.current?.getBoundingClientRect();
    const effectiveW = containerRect ? containerRect.width : viewportWidth;
    const effectiveH = containerRect ? containerRect.height : viewportHeight;
    const nextViewport = getFitToScreenViewport({
      elementsToFit: board.elements,
      viewportWidth: effectiveW,
      viewportHeight: effectiveH,
      viewportInsets,
    });
    if (!nextViewport) {
      return;
    }

    setZoom(nextViewport.zoom);
    setCamera(nextViewport.cameraX, nextViewport.cameraY);
  };

  const handleFitFrameToSelection = () => {
    if (!board || !fitFrameBounds) {
      return;
    }

    const frameRect = createFrameRect(fitFrameBounds);

    if (selectedFrame) {
      const nextFrame: FrameElement = {
        ...selectedFrame,
        x: frameRect.x,
        y: frameRect.y,
        width: frameRect.width,
        height: frameRect.height,
      };
      updateElement(selectedFrame.id, nextFrame);
      pushCommand(createElementUpdateCommand(
        [selectedFrame],
        [nextFrame],
        createChangedKeysByElementId([selectedFrame.id], ['x', 'y', 'width', 'height']),
      ));
      setSelectedElementIds([selectedFrame.id]);
      setActiveTool('select');
      setDirty(true);
      onBoardChanged?.('resize', createElementUpdatedOperation(nextFrame));
      collapseCompactToolbarAfterAction();
      return;
    }

    const nextFrame: FrameElement = {
      $type: 'frame',
      id: uuidv4(),
      x: frameRect.x,
      y: frameRect.y,
      width: frameRect.width,
      height: frameRect.height,
      zIndex: fitFrameTargets.length > 0 ? Math.min(...fitFrameTargets.map((element) => element.zIndex ?? 0)) - 1 : 0,
      rotation: 0,
      label: '',
      labelFontSize: null,
      labelColor: null,
      fontFamily: null,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
      labelHorizontalAlignment: HorizontalLabelAlignment.Left,
      labelVerticalAlignment: VerticalLabelAlignment.Middle,
      fillColor: defaultFrameColors.fillColor,
      strokeColor: defaultFrameColors.strokeColor,
      strokeWidth: 2,
      ...(useStylePresetStore.getState().resolvePlacementStyle('frame') ?? {}),
    };

    addElement(nextFrame);
    pushCommand(createAddElementsCommand([nextFrame]));
    setSelectedElementIds([nextFrame.id]);
    setActiveTool('select');
    setDirty(true);
    onBoardChanged?.('add', createElementAddedOperation(nextFrame));
    collapseCompactToolbarAfterAction();
  };

  const handleInsertFile = async (fileInfo: BoardFileInfo) => {
    const centerX = (-cameraX + viewportWidth / 2) / zoom;
    const centerY = (-cameraY + viewportHeight / 2) / zoom;

    const isImage = fileInfo.contentType.startsWith('image/');

    // For images: load actual dimensions and cap to max 600px on longest side
    let w = isImage ? 400 : 160;
    let h = isImage ? 300 : 200;

    if (isImage) {
      try {
        await new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const maxSize = 600;
            const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
            w = Math.round(img.naturalWidth * scale);
            h = Math.round(img.naturalHeight * scale);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = fileInfo.url;
        });
      } catch { /* use defaults */ }
    }

    const newElement: FileElement = {
      $type: 'file',
      id: uuidv4(),
      groupId: null,
      x: centerX - w / 2,
      y: centerY - h / 2,
      width: w,
      height: h,
      zIndex: (board?.elements.length ?? 0) + 1,
      rotation: 0,
      label: fileInfo.fileName,
      labelFontSize: null,
      labelColor: null,
      fontFamily: null,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
      isLocked: false,
      labelHorizontalAlignment: HorizontalLabelAlignment.Center,
      labelVerticalAlignment: VerticalLabelAlignment.Middle,
      fileUrl: fileInfo.url,
      fileName: fileInfo.fileName,
      contentType: fileInfo.contentType,
      fileSize: fileInfo.size,
      opacity: 1,
      imageFit: ImageFit.Uniform,
    };
    addElement(newElement);
    pushCommand(createAddElementsCommand([newElement]));
    setSelectedElementIds([newElement.id]);
    setActiveTool('select');
    setDirty(true);
    onBoardChanged?.('add', createElementAddedOperation(newElement));
    collapseCompactToolbarAfterAction();
  };

  const renderToolButton = ({
    tool,
    icon,
    label,
    shortcut,
  }: {
    tool: ToolType;
    icon: ReactNode;
    label: string;
    shortcut?: string;
  }) => (
    <Tooltip
      key={tool}
      title={shortcut ? `${label} (${shortcut})` : label}
      placement={isCompactLayout ? 'top' : 'right'}
    >
      <IconButton
        size={isCompactLayout ? 'medium' : 'small'}
        color={activeTool === tool ? 'primary' : 'default'}
        onClick={(event) => handleToolClick(event, tool)}
        aria-label={label}
        sx={{
          bgcolor: activeTool === tool ? 'action.selected' : undefined,
          flexShrink: 0,
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  const renderGroupDivider = (key: string) => (
    <Divider
      key={key}
      flexItem
      orientation="horizontal"
      sx={{
        my: isCompactLayout ? 0.25 : 0.5,
        flexBasis: isCompactLayout ? '100%' : 'auto',
        width: isCompactLayout ? '100%' : 'auto',
      }}
    />
  );

  const shapeMenuButton = (
    <Tooltip title={t('tools.shapes', 'Formen')} placement={isCompactLayout ? 'top' : 'right'}>
      <IconButton
        size={isCompactLayout ? 'medium' : 'small'}
        color={activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'triangle' || activeTool === 'rhombus' ? 'primary' : 'default'}
        onClick={(event) => setShapeAnchorEl(event.currentTarget)}
        sx={{
          bgcolor: activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'triangle' || activeTool === 'rhombus'
            ? 'action.selected'
            : undefined,
          flexShrink: 0,
          position: 'relative',
        }}
        aria-label={t('tools.shapes', 'Formen')}
        aria-haspopup="menu"
        aria-expanded={Boolean(shapeAnchorEl)}
      >
        {activeShapeDescriptor.icon}
        <KeyboardArrowDownIcon
          sx={{
            position: 'absolute',
            right: -4,
            bottom: -3,
            fontSize: 14,
            bgcolor: 'background.paper',
            borderRadius: '999px',
          }}
        />
      </IconButton>
    </Tooltip>
  );

  const arrowMenuButton = (
    <Tooltip title={t('tools.arrowStyles', 'Pfeile')} placement={isCompactLayout ? 'top' : 'right'}>
      <IconButton
        size={isCompactLayout ? 'medium' : 'small'}
        color={activeTool === 'arrow' ? 'primary' : 'default'}
        onClick={(event) => setArrowAnchorEl(event.currentTarget)}
        sx={{
          bgcolor: activeTool === 'arrow' ? 'action.selected' : undefined,
          flexShrink: 0,
          position: 'relative',
        }}
        aria-label={t('tools.arrowStyles', 'Pfeile')}
        aria-haspopup="menu"
        aria-expanded={Boolean(arrowAnchorEl)}
      >
        {activeArrowDescriptor.icon}
        <KeyboardArrowDownIcon
          sx={{
            position: 'absolute',
            right: -4,
            bottom: -3,
            fontSize: 14,
            bgcolor: 'background.paper',
            borderRadius: '999px',
          }}
        />
      </IconButton>
    </Tooltip>
  );

  const toolButtons = (
    <>
      {renderToolButton(toolById.get('select')!)}
      {renderToolButton(toolById.get('hand')!)}
      {renderGroupDivider('toolbar-nav-divider')}
      {renderToolButton(toolById.get('drawing')!)}
      {renderGroupDivider('toolbar-drawing-divider')}
      {shapeMenuButton}
      {arrowMenuButton}
      {renderToolButton(toolById.get('frame')!)}
      {renderGroupDivider('toolbar-structure-divider')}
      {renderToolButton(toolById.get('text')!)}
      {renderToolButton(toolById.get('sticky')!)}
      {renderGroupDivider('toolbar-content-divider')}
      {renderToolButton(toolById.get('icon')!)}
      {renderToolButton(toolById.get('image')!)}
    </>
  );

  const extraButtons = (
    <>
      {activePresetType && (
        <>
          {renderGroupDivider('toolbar-style-presets-divider')}
          <Tooltip
            title={t('stylePresets.manageTooltip', {
              current: activeStylePresetSummary ?? t('stylePresets.themeDefault', 'Theme-Standard'),
              defaultValue: 'Formatvorlagen (aktuell: {{current}})',
            })}
            placement={isCompactLayout ? 'top' : 'right'}
          >
            <IconButton
              size={isCompactLayout ? 'medium' : 'small'}
              onClick={(event) => setStylePresetAnchorEl(event.currentTarget)}
              color={activePlacementPreference?.mode === 'theme-default' ? 'default' : 'primary'}
              sx={{ flexShrink: 0, position: 'relative' }}
              aria-label={t('stylePresets.manageButton', 'Formatvorlagen')}
              aria-haspopup="menu"
              aria-expanded={Boolean(stylePresetAnchorEl)}
            >
              <AutoFixHighIcon />
              <KeyboardArrowDownIcon
                sx={{
                  position: 'absolute',
                  right: -4,
                  bottom: -3,
                  fontSize: 14,
                  bgcolor: 'background.paper',
                  borderRadius: '999px',
                }}
              />
            </IconButton>
          </Tooltip>
        </>
      )}
      {renderGroupDivider('toolbar-actions-divider')}

      <Tooltip title={t('tools.undo')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton size={isCompactLayout ? 'medium' : 'small'} onClick={handleUndo} disabled={!canUndo} sx={{ flexShrink: 0 }}>
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.redo')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton size={isCompactLayout ? 'medium' : 'small'} onClick={handleRedo} disabled={!canRedo} sx={{ flexShrink: 0 }}>
            <RedoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.delete')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={handleDelete}
            disabled={!canDeleteCurrentSelection}
            sx={{ flexShrink: 0 }}
          >
            <DeleteIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.group')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={handleGroup}
            disabled={!canGroup}
            sx={{ flexShrink: 0 }}
          >
            <GroupWorkIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.ungroup')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={handleUngroup}
            disabled={!canUngroup}
            sx={{ flexShrink: 0 }}
          >
            <CallSplitIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.arrange')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={(event) => setArrangeAnchorEl(event.currentTarget)}
            disabled={selectedIds.length === 0}
            sx={{ flexShrink: 0 }}
            aria-label={t('tools.arrange')}
            aria-haspopup="menu"
            aria-expanded={Boolean(arrangeAnchorEl)}
          >
            <SvgIcon fontSize="small">
              <path d={mdiLayersOutline} />
            </SvgIcon>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.fitFrameToSelection')} placement={isCompactLayout ? 'top' : 'right'}>
        <span>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={handleFitFrameToSelection}
            disabled={!canFitFrameSelection}
            sx={{ flexShrink: 0 }}
          >
            <CropFreeIcon />
          </IconButton>
        </span>
      </Tooltip>

      {renderGroupDivider('toolbar-zoom-divider')}

      <Tooltip title={t('tools.zoomIn')} placement={isCompactLayout ? 'top' : 'right'}>
        <IconButton size={isCompactLayout ? 'medium' : 'small'} onClick={handleZoomIn} sx={{ flexShrink: 0 }}>
          <ZoomInIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('tools.zoomOut')} placement={isCompactLayout ? 'top' : 'right'}>
        <IconButton size={isCompactLayout ? 'medium' : 'small'} onClick={handleZoomOut} sx={{ flexShrink: 0 }}>
          <ZoomOutIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('tools.fitToScreen')} placement={isCompactLayout ? 'top' : 'right'}>
        <IconButton size={isCompactLayout ? 'medium' : 'small'} onClick={handleFitToScreen} sx={{ flexShrink: 0 }}>
          <FitScreenIcon />
        </IconButton>
      </Tooltip>
      {onToggleMinimap && (
        <Tooltip title={t('tools.minimap')} placement={isCompactLayout ? 'top' : 'right'}>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={() => {
              onToggleMinimap();
              collapseCompactToolbarAfterAction();
            }}
            color={minimapVisible ? 'primary' : 'default'}
            sx={{ flexShrink: 0 }}
          >
            <MapIcon />
          </IconButton>
        </Tooltip>
      )}
    </>
  );

  const actionButtons = (
    <>
      {toolButtons}
      {extraButtons}
    </>
  );

  return (
    <Paper
      ref={paperRef}
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: isCompactLayout ? 0.75 : 1,
        px: isCompactLayout ? 0.75 : 0.5,
        gap: 0.5,
        borderRadius: isCompactLayout ? 3 : 0,
        flexShrink: 0,
        width: isCompactLayout ? 'auto' : 'fit-content',
        minWidth: isCompactLayout ? undefined : 48,
        maxWidth: isCompactLayout ? (collapsed ? undefined : 'calc(100% - 24px)') : undefined,
        position: isCompactLayout ? 'absolute' : 'relative',
        left: isCompactLayout ? 12 : 'auto',
        right: isCompactLayout ? (collapsed ? 'auto' : 12) : 'auto',
        bottom: isCompactLayout ? 'calc(12px + env(safe-area-inset-bottom))' : 'auto',
        zIndex: isCompactLayout ? 6 : 'auto',
        overflow: 'hidden',
      }}
    >
      {/* Hidden single-column measurement element used by ResizeObserver to detect
          when the content would overflow in a single column. position:fixed takes it
          out of flow and out of the Paper's overflow clip. */}
      {!isCompactLayout && (
        <Box
          ref={singleColMeasureRef}
          aria-hidden="true"
          sx={{
            position: 'fixed',
            top: 0,
            left: '-99999px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            py: 1,
            alignItems: 'center',
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {toolButtons}
          {extraButtons}
        </Box>
      )}

      {isCompactLayout ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', width: collapsed ? 'auto' : '100%', gap: 1 }}>
            <Tooltip title={collapsed ? t('tools.expandToolbar', 'Werkzeugleiste öffnen') : t('tools.collapseToolbar', 'Werkzeugleiste einklappen')} placement="top">
              <IconButton onClick={() => setCompactCollapsed((current) => !current)} size="medium" sx={{ flexShrink: 0 }} aria-label={collapsed ? t('tools.expandToolbar', 'Werkzeugleiste öffnen') : t('tools.collapseToolbar', 'Werkzeugleiste einklappen')}>
                {collapsed ? (activeTool === 'select' ? <ConstructionIcon /> : <KeyboardArrowUpIcon />) : <KeyboardArrowDownIcon />}
              </IconButton>
            </Tooltip>
            {/* On mobile collapsed, hide the label for the select tool to show only the round button */}
            {!(collapsed && activeTool === 'select') && (
              <Typography variant="caption" noWrap sx={{ flex: collapsed ? '0 1 auto' : 1, minWidth: 0 }}>
                {activeToolLabel}
              </Typography>
            )}
          </Box>
          {!collapsed && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 0.5,
                width: '100%',
                overflowX: 'visible',
                pb: 0.25,
              }}
            >
              {actionButtons}
            </Box>
          )}
        </>
      ) : twoColumns ? (
        // Two-column layout: tool selection on the left, actions+zoom on the right.
        // Rendered explicitly when single-column content would overflow the toolbar.
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            {toolButtons}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            {extraButtons}
          </Box>
        </Box>
      ) : (
        actionButtons
      )}

      <Menu
        anchorEl={shapeAnchorEl}
        open={Boolean(shapeAnchorEl)}
        onClose={() => setShapeAnchorEl(null)}
      >
        {shapeTools.map((tool) => (
          <MenuItem key={tool.tool} selected={activeTool === tool.tool} onClick={() => handleShapeSelected(tool.tool)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {tool.icon}
              <Typography variant="body2">{tool.label}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={arrowAnchorEl}
        open={Boolean(arrowAnchorEl)}
        onClose={() => setArrowAnchorEl(null)}
      >
        {arrowRouteOptions.map((option) => (
          <MenuItem
            key={option.routeStyle}
            selected={activeTool === 'arrow' && pendingArrowRouteStyle === option.routeStyle}
            onClick={() => handleArrowRouteSelected(option.routeStyle)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {option.icon}
              <Typography variant="body2">{option.label}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={iconGroupAnchorEl}
        open={Boolean(iconGroupAnchorEl)}
        onClose={() => setIconGroupAnchorEl(null)}
      >
        <MenuItem selected={activeIconGroupKey === 'all'} onClick={() => openIconPicker('all')}>
          <ListItemText primary={t('tools.allIcons', 'Alle Icons')} />
        </MenuItem>
        {enabledIconGroups.map((group) => {
          const icon = getIconDefinition(group.iconName);
          return (
            <MenuItem
              key={group.key}
              selected={activeIconGroupKey === group.key}
              onClick={() => openIconPicker(group.key)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                {icon ? (
                  <CatalogIconGlyph icon={icon} fontSize="small" />
                ) : (
                  <AddReactionIcon fontSize="small" />
                )}
                <ListItemText
                  primary={t(group.labelKey, group.defaultLabel)}
                  secondary={t(group.descriptionKey, group.defaultDescription)}
                />
              </Box>
            </MenuItem>
          );
        })}
      </Menu>

      <Dialog
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t('tools.icon')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              size="small"
              label={t('tools.allIcons', 'Alle Icons')}
              color={activeIconGroupKey === 'all' ? 'primary' : 'default'}
              variant={activeIconGroupKey === 'all' ? 'filled' : 'outlined'}
              onClick={() => setRequestedIconGroupKey('all')}
            />
            {ICON_GROUP_DEFINITIONS.map((group) => (
              <Chip
                key={group.key}
                size="small"
                label={t(group.labelKey, group.defaultLabel)}
                color={activeIconGroupKey === group.key ? 'primary' : 'default'}
                variant={activeIconGroupKey === group.key ? 'filled' : 'outlined'}
                onClick={() => setRequestedIconGroupKey(group.key)}
              />
            ))}
          </Box>
          <TextField
            fullWidth
            size="small"
            label={t('tools.iconSearch')}
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {selectedIconGroup && !iconSearch.trim()
                ? t(selectedIconGroup.descriptionKey, selectedIconGroup.defaultDescription)
                : activeIconGroupKey === 'all' && !iconSearch.trim()
                  ? t('tools.iconBrowseAllHint', {
                    count: filteredIcons.length,
                    defaultValue: 'Alle {{count}} Icons werden angezeigt.',
                  })
                  : iconSearch.trim()
                    ? t('tools.iconResults', { count: filteredIcons.length })
                    : t('tools.iconBrowseHint')}
            </Typography>
          </Box>
          <IconPickerGrid icons={filteredIcons} onSelect={handleIconSelected} />
        </DialogContent>
      </Dialog>

      <Menu
        anchorEl={arrangeAnchorEl}
        open={Boolean(arrangeAnchorEl)}
        onClose={() => setArrangeAnchorEl(null)}
      >
        <ZOrderMenuItems
          availability={zOrderAvailability}
          onSelect={handleZOrderAction}
        />
      </Menu>

      <Menu
        anchorEl={stickyPresetAnchorEl}
        open={Boolean(stickyPresetAnchorEl)}
        onClose={() => setStickyPresetAnchorEl(null)}
      >
        {stickyNotePresets.map((preset) => (
          <MenuItem
            key={preset.id}
            selected={preset.id === activeStickyPresetId}
            onClick={() => handleStickyPresetSelected(preset.id)}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: 0.75,
                bgcolor: preset.fillColor,
                border: '1px solid rgba(15, 23, 42, 0.18)',
                mr: 1.25,
                flexShrink: 0,
              }}
            />
            <Typography variant="body2">{preset.label}</Typography>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={stylePresetAnchorEl}
        open={Boolean(stylePresetAnchorEl)}
        onClose={() => setStylePresetAnchorEl(null)}
      >
        <MenuItem
          selected={activePlacementPreference?.mode === 'theme-default'}
          onClick={() => handlePlacementModeSelected('theme-default')}
        >
          <ListItemText primary={t('stylePresets.themeDefault', 'Theme-Standard')} />
        </MenuItem>
        <Divider />
        {activePresetChoices.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary={t('stylePresets.noPresetsForType', 'Für diesen Elementtyp wurden noch keine Presets gespeichert.')} />
          </MenuItem>
        ) : activePresetChoices.map((preset) => (
          <MenuItem
            key={preset.id}
            selected={activePlacementPreference?.mode === 'preset' && activePlacementPreference.presetId === preset.id}
            onClick={() => handleDefaultPresetSelected(preset.id)}
          >
            <ListItemText primary={preset.name} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setStylePresetAnchorEl(null);
            setStylePresetDialogOpen(true);
          }}
        >
          <ListItemText primary={t('stylePresets.manageButton', 'Formatvorlagen ...')} />
        </MenuItem>
      </Menu>

      <FileLibraryDialog
        open={imageLibraryOpen}
        boardId={board?.id ?? ''}
        onClose={() => setImageLibraryOpen(false)}
        onInsertFile={handleInsertFile}
        shareToken={shareToken}
        sharePassword={sharePassword}
      />
      <StylePresetDialog
        open={stylePresetDialogOpen}
        onClose={() => setStylePresetDialogOpen(false)}
        elementType={activePresetType}
        onBoardChanged={onBoardChanged}
      />
    </Paper>
  );
});
