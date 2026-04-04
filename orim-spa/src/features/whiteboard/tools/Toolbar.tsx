import React, { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Divider,
  Menu,
  MenuItem,
  Paper,
  SvgIcon,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { mdiLayersOutline } from '@mdi/js';
import NearMeIcon from '@mui/icons-material/NearMe';
import PanToolIcon from '@mui/icons-material/PanTool';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import CropLandscapeIcon from '@mui/icons-material/CropLandscape';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import ImageIcon from '@mui/icons-material/Image';
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
import { filterIconDefinitions, getIconDefinition } from '../icons/iconCatalog';
import { ImageLibraryDialog } from '../ImageLibraryDialog';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import {
  asOperationPayload,
  createElementAddedOperation,
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
import { getBoundingRect, type Rect } from '../../../utils/geometry';
import { computeArrowPolyline } from '../../../utils/arrowRouting';
import { HorizontalLabelAlignment, VerticalLabelAlignment, ImageFit, type BoardElement, type FrameElement, type ImageElement } from '../../../types/models';
import { getEffectiveStickyNotePresets } from '../stickyNotePresets';
import { ZOrderMenuItems } from '../ZOrderMenuItems';
import {
  applyZOrderAction,
  getZOrderAvailability,
  type ZOrderAction,
} from '../zOrder';
import { v4 as uuidv4 } from 'uuid';

interface ToolbarProps {
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  /** Ref to the canvas container element, used for accurate fit-to-screen viewport measurement. */
  canvasContainerRef?: React.RefObject<HTMLElement | null>;
  minimapVisible?: boolean;
  onToggleMinimap?: () => void;
}

const FRAME_WRAP_HORIZONTAL_PADDING = 24;
const FRAME_WRAP_TOP_PADDING = 56;
const FRAME_WRAP_BOTTOM_PADDING = 24;

function getElementBounds(element: BoardElement, elements: BoardElement[]): Rect | null {
  if (element.$type !== 'arrow') {
    return getBoundingRect([element]);
  }

  const points = computeArrowPolyline(element, elements);
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getBoundsForElements(elementsToMeasure: BoardElement[], allElements: BoardElement[]): Rect | null {
  const bounds = elementsToMeasure
    .map((element) => getElementBounds(element, allElements))
    .filter((candidate): candidate is Rect => candidate != null);

  if (bounds.length === 0) {
    return null;
  }

  return {
    x: Math.min(...bounds.map((bound) => bound.x)),
    y: Math.min(...bounds.map((bound) => bound.y)),
    width: Math.max(...bounds.map((bound) => bound.x + bound.width)) - Math.min(...bounds.map((bound) => bound.x)),
    height: Math.max(...bounds.map((bound) => bound.y + bound.height)) - Math.min(...bounds.map((bound) => bound.y)),
  };
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

export const Toolbar = React.memo(function Toolbar({ onBoardChanged, canvasContainerRef, minimapVisible, onToggleMinimap }: ToolbarProps) {
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
  const pendingIconName = useBoardStore((s) => s.pendingIconName);
  const setPendingIconName = useBoardStore((s) => s.setPendingIconName);
  const board = useBoardStore((s) => s.board);
  const setElements = useBoardStore((s) => s.setElements);
  const applyLocalCommand = useBoardStore((s) => s.applyLocalCommand);
  const setDirty = useBoardStore((s) => s.setDirty);
  const pendingStickyNotePresetId = useBoardStore((s) => s.pendingStickyNotePresetId);
  const setPendingStickyNotePresetId = useBoardStore((s) => s.setPendingStickyNotePresetId);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);

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
  const [stickyPresetAnchorEl, setStickyPresetAnchorEl] = useState<HTMLElement | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [compactCollapsed, setCompactCollapsed] = useState(isCompactLayout);

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

  const selectedIcon = getIconDefinition(pendingIconName);
  const filteredIcons = useMemo(() => filterIconDefinitions(iconSearch), [iconSearch]);
  const stickyNotePresets = useMemo(() => getEffectiveStickyNotePresets(board, t), [board, t]);
  const activeStickyPresetId = stickyNotePresets.some((preset) => preset.id === pendingStickyNotePresetId)
    ? pendingStickyNotePresetId
    : (stickyNotePresets[0]?.id ?? null);

  const tools: { tool: ToolType; icon: ReactNode; label: string }[] = [
    { tool: 'select', icon: <NearMeIcon />, label: t('tools.select') },
    { tool: 'hand', icon: <PanToolIcon />, label: t('tools.hand') },
    { tool: 'rectangle', icon: <RectangleOutlinedIcon />, label: t('tools.rectangle') },
    { tool: 'ellipse', icon: <CircleOutlinedIcon />, label: t('tools.ellipse') },
    { tool: 'triangle', icon: <ChangeHistoryIcon />, label: t('tools.triangle') },
    { tool: 'text', icon: <TextFieldsIcon />, label: t('tools.text') },
    { tool: 'sticky', icon: <StickyNote2OutlinedIcon />, label: t('tools.stickyNote') },
    { tool: 'frame', icon: <CropLandscapeIcon />, label: t('tools.frame') },
    {
      tool: 'icon',
      icon: selectedIcon ? (
        <SvgIcon fontSize="small">
          <path d={selectedIcon.path} />
        </SvgIcon>
      ) : (
        <AddReactionIcon />
      ),
      label: t('tools.icon'),
    },
    { tool: 'arrow', icon: <ArrowForwardIcon />, label: t('tools.arrow') },
    { tool: 'image', icon: <ImageIcon />, label: t('tools.image') },
  ];

  const openIconPicker = () => {
    setIconPickerOpen(true);
  };

  const handleToolClick = (event: MouseEvent<HTMLElement>, tool: ToolType) => {
    if (tool === 'icon') {
      openIconPicker();
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
  };

  const handleIconSelected = (iconName: string) => {
    setPendingIconName(iconName);
    setActiveTool('icon');
    setIconPickerOpen(false);
    setIconSearch('');
  };

  const handleStickyPresetSelected = (presetId: string) => {
    setPendingStickyNotePresetId(presetId);
    setActiveTool('sticky');
    setStickyPresetAnchorEl(null);
  };

  const handleDelete = () => {
    if (selectedIds.length === 0 || !board) return;
    const deletedElements = board.elements.filter((element) => selectedIds.includes(element.id));
    if (deletedElements.length === 0) {
      return;
    }

    removeElements(selectedIds);
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    setDirty(true);
    onBoardChanged?.('delete', createElementsDeletedOperation(selectedIds));
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
    if (!board || board.elements.length === 0) return;
    const bounds = getBoundsForElements(board.elements, board.elements);
    if (!bounds) {
      return;
    }

    const contentW = Math.max(1, bounds.width);
    const contentH = Math.max(1, bounds.height);

    // Prefer live DOM measurement to avoid using stale store values (e.g. from a
    // previously-maximised window that has since been resized).
    const containerRect = canvasContainerRef?.current?.getBoundingClientRect();
    const effectiveW = containerRect ? containerRect.width : viewportWidth;
    const effectiveH = containerRect ? containerRect.height : viewportHeight;

    const visibleWidth = Math.max(1, effectiveW - viewportInsets.left - viewportInsets.right);
    const visibleHeight = Math.max(1, effectiveH - viewportInsets.top - viewportInsets.bottom);
    const margin = 64;
    const clampedZoom = Math.max(0.2, Math.min(
      (Math.max(1, visibleWidth - margin * 2)) / contentW,
      (Math.max(1, visibleHeight - margin * 2)) / contentH,
      3.5,
    ));
    const cxContent = bounds.x + contentW / 2;
    const cyContent = bounds.y + contentH / 2;
    const visibleCenterX = viewportInsets.left + visibleWidth / 2;
    const visibleCenterY = viewportInsets.top + visibleHeight / 2;

    setZoom(clampedZoom);
    setCamera(visibleCenterX - cxContent * clampedZoom, visibleCenterY - cyContent * clampedZoom);
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
      labelVerticalAlignment: VerticalLabelAlignment.Top,
      fillColor: 'rgba(37, 99, 235, 0.08)',
      strokeColor: 'rgba(37, 99, 235, 0.48)',
      strokeWidth: 2,
    };

    addElement(nextFrame);
    pushCommand(createAddElementsCommand([nextFrame]));
    setSelectedElementIds([nextFrame.id]);
    setActiveTool('select');
    setDirty(true);
    onBoardChanged?.('add', createElementAddedOperation(nextFrame));
  };

  const handleInsertImage = async (imageUrl: string, fileName: string) => {
    const centerX = (-cameraX + viewportWidth / 2) / zoom;
    const centerY = (-cameraY + viewportHeight / 2) / zoom;

    // Load actual image dimensions and cap to max 600px on longest side
    let w = 400;
    let h = 300;
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
        img.src = imageUrl;
      });
    } catch { /* use defaults */ }

    const newElement: ImageElement = {
      $type: 'image',
      id: uuidv4(),
      groupId: null,
      x: centerX - w / 2,
      y: centerY - h / 2,
      width: w,
      height: h,
      zIndex: (board?.elements.length ?? 0) + 1,
      rotation: 0,
      label: fileName,
      labelFontSize: null,
      labelColor: null,
      fontFamily: null,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
      labelHorizontalAlignment: HorizontalLabelAlignment.Center,
      labelVerticalAlignment: VerticalLabelAlignment.Middle,
      imageUrl,
      opacity: 1,
      imageFit: ImageFit.Uniform,
    };
    addElement(newElement);
    pushCommand(createAddElementsCommand([newElement]));
    setSelectedElementIds([newElement.id]);
    setActiveTool('select');
    setDirty(true);
    onBoardChanged?.('add', createElementAddedOperation(newElement));
  };

  const toolButtons = tools.map(({ tool, icon, label }) => (
    <Tooltip key={tool} title={label} placement={isCompactLayout ? 'top' : 'right'}>
      <IconButton
        size={isCompactLayout ? 'medium' : 'small'}
        color={activeTool === tool ? 'primary' : 'default'}
        onClick={(event) => handleToolClick(event, tool)}
        sx={{
          bgcolor: activeTool === tool ? 'action.selected' : undefined,
          flexShrink: 0,
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  ));

  const extraButtons = (
    <>
      <Divider
        flexItem
        orientation="horizontal"
        sx={{
          my: isCompactLayout ? 0.25 : 0.5,
          flexBasis: isCompactLayout ? '100%' : 'auto',
          width: isCompactLayout ? '100%' : 'auto',
        }}
      />

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
            disabled={selectedIds.length === 0}
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

      <Divider
        flexItem
        orientation="horizontal"
        sx={{
          my: isCompactLayout ? 0.25 : 0.5,
          flexBasis: isCompactLayout ? '100%' : 'auto',
          width: isCompactLayout ? '100%' : 'auto',
        }}
      />

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
        <Tooltip title="Minimap" placement={isCompactLayout ? 'top' : 'right'}>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            onClick={onToggleMinimap}
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
        maxWidth: isCompactLayout ? 'calc(100% - 24px)' : undefined,
        position: isCompactLayout ? 'absolute' : 'relative',
        left: isCompactLayout ? 12 : 'auto',
        right: isCompactLayout ? 12 : 'auto',
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
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <Tooltip title={collapsed ? t('tools.expandToolbar', 'Werkzeugleiste öffnen') : t('tools.collapseToolbar', 'Werkzeugleiste einklappen')} placement="top">
              <IconButton onClick={() => setCompactCollapsed((current) => !current)} size="medium" sx={{ flexShrink: 0 }}>
                {collapsed ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            </Tooltip>
            <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {tools.find((tool) => tool.tool === activeTool)?.label}
            </Typography>
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

      <Dialog
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t('tools.icon')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label={t('tools.iconSearch')}
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {iconSearch.trim()
              ? t('tools.iconResults', { count: filteredIcons.length })
              : t('tools.iconBrowseHint')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
              gap: 1,
            }}
          >
            {filteredIcons.map((icon) => (
              <ButtonBase
                key={icon.name}
                onClick={() => handleIconSelected(icon.name)}
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 1.5,
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.75,
                  minHeight: 84,
                }}
              >
                <SvgIcon sx={{ fontSize: 28 }}>
                  <path d={icon.path} />
                </SvgIcon>
                <Typography variant="caption" textAlign="center">
                  {icon.label}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
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

      <ImageLibraryDialog
        open={imageLibraryOpen}
        onClose={() => setImageLibraryOpen(false)}
        onInsertImage={handleInsertImage}
      />
    </Paper>
  );
});
