import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Divider,
  Paper,
  SvgIcon,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NearMeIcon from '@mui/icons-material/NearMe';
import PanToolIcon from '@mui/icons-material/PanTool';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { filterIconDefinitions, getIconDefinition } from '../icons/iconCatalog';
import { useBoardStore, type ToolType } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';

export function Toolbar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const isCompactLayout = isTouchDevice || useMediaQuery(theme.breakpoints.down('md'));
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
  const pendingIconName = useBoardStore((s) => s.pendingIconName);
  const setPendingIconName = useBoardStore((s) => s.setPendingIconName);
  const board = useBoardStore((s) => s.board);
  const setElements = useBoardStore((s) => s.setElements);
  const setDirty = useBoardStore((s) => s.setDirty);

  const canUndo = useCommandStack((s) => s.canUndo);
  const canRedo = useCommandStack((s) => s.canRedo);
  const undoFn = useCommandStack((s) => s.undo);
  const redoFn = useCommandStack((s) => s.redo);
  const pushCommand = useCommandStack((s) => s.push);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [collapsed, setCollapsed] = useState(isCompactLayout);

  const selectedElements = useMemo(
    () => board?.elements.filter((element) => selectedIds.includes(element.id)) ?? [],
    [board?.elements, selectedIds],
  );
  const selectedGroupIds = useMemo(
    () => new Set(selectedElements.flatMap((element) => element.groupId ? [element.groupId] : [])),
    [selectedElements],
  );
  const canGroup = selectedElements.length >= 2;
  const canUngroup = selectedGroupIds.size > 0;

  useEffect(() => {
    if (!isCompactLayout) {
      setCollapsed(false);
      return;
    }

    setCollapsed(true);
  }, [isCompactLayout]);

  const selectedIcon = getIconDefinition(pendingIconName);
  const filteredIcons = useMemo(() => filterIconDefinitions(iconSearch), [iconSearch]);

  const tools: { tool: ToolType; icon: ReactNode; label: string }[] = [
    { tool: 'select', icon: <NearMeIcon />, label: t('tools.select') },
    { tool: 'hand', icon: <PanToolIcon />, label: t('tools.hand') },
    { tool: 'rectangle', icon: <RectangleOutlinedIcon />, label: t('tools.rectangle') },
    { tool: 'ellipse', icon: <CircleOutlinedIcon />, label: t('tools.ellipse') },
    { tool: 'triangle', icon: <ChangeHistoryIcon />, label: t('tools.triangle') },
    { tool: 'text', icon: <TextFieldsIcon />, label: t('tools.text') },
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
  ];

  const openIconPicker = () => {
    setIconPickerOpen(true);
  };

  const handleToolClick = (tool: ToolType) => {
    if (tool === 'icon') {
      openIconPicker();
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

  const handleDelete = () => {
    if (selectedIds.length === 0 || !board) return;
    const before = [...board.elements];
    removeElements(selectedIds);
    pushCommand(before, board.elements.filter((el) => !selectedIds.includes(el.id)));
    setSelectedElementIds([]);
    setDirty(true);
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
    pushCommand(before, after);
    setSelectedElementIds(after.filter((element) => element.groupId === nextGroupId).map((element) => element.id));
    setDirty(true);
  };

  const handleUngroup = () => {
    if (!board || selectedGroupIds.size === 0) return;

    const before = [...board.elements];
    const after = board.elements.map((element) => (
      element.groupId && selectedGroupIds.has(element.groupId)
        ? { ...element, groupId: null }
        : element
    ));

    setElements(after);
    pushCommand(before, after);
    setSelectedElementIds(selectedIds.filter((id) => after.some((element) => element.id === id)));
    setDirty(true);
  };

  const handleUndo = () => {
    const result = undoFn();
    if (result) {
      setElements(result);
      setDirty(true);
    }
  };

  const handleRedo = () => {
    const result = redoFn();
    if (result) {
      setElements(result);
      setDirty(true);
    }
  };

  const handleZoomIn = () => setZoom(Math.min(3.5, zoom * 1.2));
  const handleZoomOut = () => setZoom(Math.max(0.2, zoom / 1.2));

  const handleFitToScreen = () => {
    if (!board || board.elements.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of board.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const visibleWidth = Math.max(1, viewportWidth - viewportInsets.left - viewportInsets.right);
    const visibleHeight = Math.max(1, viewportHeight - viewportInsets.top - viewportInsets.bottom);
    const margin = 64;
    const clampedZoom = Math.max(0.2, Math.min(
      (Math.max(1, visibleWidth - margin * 2)) / contentW,
      (Math.max(1, visibleHeight - margin * 2)) / contentH,
      3.5,
    ));
    const cxContent = minX + contentW / 2;
    const cyContent = minY + contentH / 2;
    const visibleCenterX = viewportInsets.left + visibleWidth / 2;
    const visibleCenterY = viewportInsets.top + visibleHeight / 2;

    setZoom(clampedZoom);
    setCamera(visibleCenterX - cxContent * clampedZoom, visibleCenterY - cyContent * clampedZoom);
  };

  const actionButtons = (
    <>
      {tools.map(({ tool, icon, label }) => (
        <Tooltip key={tool} title={label} placement={isCompactLayout ? 'top' : 'right'}>
          <IconButton
            size={isCompactLayout ? 'medium' : 'small'}
            color={activeTool === tool ? 'primary' : 'default'}
            onClick={() => handleToolClick(tool)}
            sx={{
              bgcolor: activeTool === tool ? 'action.selected' : undefined,
              flexShrink: 0,
            }}
          >
            {icon}
          </IconButton>
        </Tooltip>
      ))}

      <Divider flexItem orientation={isCompactLayout ? 'vertical' : 'horizontal'} sx={{ my: isCompactLayout ? 0 : 0.5, mx: isCompactLayout ? 0.5 : 0 }} />

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

      <Divider flexItem orientation={isCompactLayout ? 'vertical' : 'horizontal'} sx={{ my: isCompactLayout ? 0 : 0.5, mx: isCompactLayout ? 0.5 : 0 }} />

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
    </>
  );

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: isCompactLayout ? 'column' : 'column',
        alignItems: 'center',
        py: isCompactLayout ? 0.75 : 1,
        px: isCompactLayout ? 0.75 : 0.5,
        gap: 0.5,
        borderRadius: isCompactLayout ? 3 : 0,
        flexShrink: 0,
        width: isCompactLayout ? 'auto' : 48,
        maxWidth: isCompactLayout ? 'calc(100% - 24px)' : 48,
        position: isCompactLayout ? 'absolute' : 'relative',
        left: isCompactLayout ? 12 : 'auto',
        right: isCompactLayout ? 12 : 'auto',
        bottom: isCompactLayout ? 'calc(12px + env(safe-area-inset-bottom))' : 'auto',
        zIndex: isCompactLayout ? 6 : 'auto',
        overflow: 'hidden',
      }}
    >
      {isCompactLayout ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <Tooltip title={collapsed ? t('tools.expandToolbar', 'Werkzeugleiste öffnen') : t('tools.collapseToolbar', 'Werkzeugleiste einklappen')} placement="top">
              <IconButton onClick={() => setCollapsed((current) => !current)} size="medium" sx={{ flexShrink: 0 }}>
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
                gap: 0.5,
                width: '100%',
                overflowX: 'auto',
                pb: 0.25,
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
                scrollbarWidth: 'none',
              }}
            >
              {actionButtons}
            </Box>
          )}
        </>
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
    </Paper>
  );
}
