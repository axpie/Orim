import { useMemo, useState, type ReactNode } from 'react';
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
} from '@mui/material';
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
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { filterIconDefinitions, getIconDefinition } from '../icons/iconCatalog';
import { useBoardStore, type ToolType } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';

export function Toolbar() {
  const { t } = useTranslation();
  const activeTool = useBoardStore((s) => s.activeTool);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const zoom = useBoardStore((s) => s.zoom);
  const setZoom = useBoardStore((s) => s.setZoom);
  const setCamera = useBoardStore((s) => s.setCamera);
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
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    // Assuming 800x600 viewport — in practice read from container
    const viewW = 800;
    const viewH = 600;
    const margin = 64;
    const newZoom = Math.min(
      (viewW - margin * 2) / contentW,
      (viewH - margin * 2) / contentH,
      3.5,
    );
    const cxContent = minX + contentW / 2;
    const cyContent = minY + contentH / 2;
    setZoom(Math.max(0.2, newZoom));
    setCamera(viewW / 2 - cxContent * newZoom, viewH / 2 - cyContent * newZoom);
  };

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 1,
        px: 0.5,
        gap: 0.5,
        borderRadius: 0,
        flexShrink: 0,
        width: 48,
      }}
    >
      {tools.map(({ tool, icon, label }) => (
        <Tooltip key={tool} title={label} placement="right">
          <IconButton
            size="small"
            color={activeTool === tool ? 'primary' : 'default'}
            onClick={() => handleToolClick(tool)}
            sx={{
              bgcolor: activeTool === tool ? 'action.selected' : undefined,
            }}
          >
            {icon}
          </IconButton>
        </Tooltip>
      ))}

      <Divider flexItem sx={{ my: 0.5 }} />

      <Tooltip title={t('tools.undo')} placement="right">
        <span>
          <IconButton size="small" onClick={handleUndo} disabled={!canUndo}>
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.redo')} placement="right">
        <span>
          <IconButton size="small" onClick={handleRedo} disabled={!canRedo}>
            <RedoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('tools.delete')} placement="right">
        <span>
          <IconButton
            size="small"
            onClick={handleDelete}
            disabled={selectedIds.length === 0}
          >
            <DeleteIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Divider flexItem sx={{ my: 0.5 }} />

      <Tooltip title={t('tools.zoomIn')} placement="right">
        <IconButton size="small" onClick={handleZoomIn}>
          <ZoomInIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('tools.zoomOut')} placement="right">
        <IconButton size="small" onClick={handleZoomOut}>
          <ZoomOutIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('tools.fitToScreen')} placement="right">
        <IconButton size="small" onClick={handleFitToScreen}>
          <FitScreenIcon />
        </IconButton>
      </Tooltip>

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
