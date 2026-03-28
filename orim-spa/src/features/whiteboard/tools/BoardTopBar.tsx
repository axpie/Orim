import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatIcon from '@mui/icons-material/Chat';
import SettingsIcon from '@mui/icons-material/Settings';
import TuneIcon from '@mui/icons-material/Tune';
import ShareIcon from '@mui/icons-material/Share';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useBoardStore } from '../store/boardStore';
import { AppSettingsDialog } from '../../../components/dialogs/AppSettingsDialog';
import { exportBoardJson, exportBoardPdf } from '../../../api/boards';
import { ShareDialog } from '../../sharing/ShareDialog';
import type { CursorPresence } from '../../../types/models';

interface BoardTopBarProps {
  onOpenProperties: () => void;
  onOpenChat: () => void;
  propertiesOpen: boolean;
  chatOpen: boolean;
  saving: boolean;
  titleEditable?: boolean;
  showShare?: boolean;
  showExport?: boolean;
  showProperties?: boolean;
  showChat?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  collaborators?: CursorPresence[];
  localConnectionId?: string | null;
}

export function BoardTopBar({
  onOpenProperties,
  onOpenChat,
  propertiesOpen,
  chatOpen,
  saving,
  titleEditable = true,
  showShare = true,
  showExport = true,
  showProperties = true,
  showChat = true,
  showBackButton = true,
  onBack,
  collaborators = [],
  localConnectionId = null,
}: BoardTopBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const board = useBoardStore((s) => s.board);
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const isDirty = useBoardStore((s) => s.isDirty);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileActionsAnchor, setMobileActionsAnchor] = useState<null | HTMLElement>(null);

  const handleTitleFocus = () => {
    if (!titleEditable) {
      return;
    }

    setTitle(board?.title ?? '');
    setEditing(true);
  };

  const handleTitleBlur = () => {
    setEditing(false);
    if (title.trim() && title !== board?.title) {
      updateBoard({ title: title.trim() });
    }
  };

  const handleExportJson = async () => {
    if (!board) return;
    setExportAnchor(null);
    const json = await exportBoardJson(board.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    if (!board) return;
    setExportAnchor(null);
    const blob = await exportBoardPdf(board.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeMobileActions = () => setMobileActionsAnchor(null);

  const compactCollaborators = collaborators.length > 0
    ? collaborators.filter((collaborator) => collaborator.clientId !== localConnectionId).length
    : 0;

  return (
    <>
      <AppBar position="static" color="default" elevation={1} sx={{ zIndex: 10 }}>
        <Toolbar
          variant="dense"
          sx={{
            minHeight: { xs: 'calc(48px + env(safe-area-inset-top))', sm: 48 },
            pt: { xs: 'env(safe-area-inset-top)', sm: 0 },
            px: { xs: 1, sm: 2 },
            gap: 0.5,
          }}
        >
          {showBackButton && (
            <Tooltip title={t('app.dashboard')}>
              <IconButton edge="start" onClick={() => (onBack ? onBack() : navigate('/'))} sx={{ color: 'inherit' }}>
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
          )}

          {editing && titleEditable ? (
            <TextField
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(false);
              }}
              size="small"
              autoFocus
              sx={{ mx: 1, width: { xs: 150, sm: 300 } }}
            />
          ) : (
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{
                mx: 1,
                cursor: titleEditable ? 'pointer' : 'default',
                minWidth: 0,
                flexShrink: 1,
                maxWidth: { xs: 160, sm: 320 },
              }}
              onClick={handleTitleFocus}
              noWrap
            >
              {board?.title ?? t('board.untitled')}
            </Typography>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
            {saving ? (
              <CircularProgress size={16} sx={{ mr: 1 }} />
            ) : isDirty ? null : (
              <Tooltip title={t('board.saved')}>
                <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1 }} />
              </Tooltip>
            )}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!isCompact && collaborators.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mr: 2, overflow: 'hidden', maxWidth: 420 }}>
              {collaborators.slice(0, 5).map((collaborator) => (
                <Chip
                  key={collaborator.clientId}
                  size="small"
                  label={collaborator.clientId === localConnectionId ? `${collaborator.displayName} (You)` : collaborator.displayName}
                  sx={{
                    color: 'inherit',
                    border: '1px solid rgba(255,255,255,0.22)',
                    bgcolor: 'rgba(255,255,255,0.08)',
                    maxWidth: 160,
                    '& .MuiChip-label': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  }}
                  avatar={<Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: collaborator.colorHex, ml: 1 }} />}
                />
              ))}
              {collaborators.length > 5 && <Chip size="small" label={`+${collaborators.length - 5}`} />}
            </Stack>
          )}

          {isCompact && compactCollaborators > 0 && (
            <Chip size="small" label={`+${compactCollaborators}`} sx={{ mr: 0.5 }} />
          )}

          {isCompact ? (
            <Tooltip title={t('board.moreActions', 'Aktionen')}>
              <IconButton onClick={(event) => setMobileActionsAnchor(event.currentTarget)} sx={{ color: 'inherit' }}>
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <>
              {showShare && (
                <Tooltip title={t('board.share')}>
                  <IconButton onClick={() => setShareOpen(true)} sx={{ color: 'inherit' }}>
                    <ShareIcon />
                  </IconButton>
                </Tooltip>
              )}

              {showExport && (
                <Tooltip title={t('board.export')}>
                  <IconButton onClick={(e) => setExportAnchor(e.currentTarget)} sx={{ color: 'inherit' }}>
                    <FileDownloadIcon />
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title={t('app.settings')}>
                <IconButton
                  onClick={() => setSettingsOpen(true)}
                  sx={{ color: 'inherit', bgcolor: settingsOpen ? 'rgba(255,255,255,0.14)' : undefined }}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>

              {showProperties && (
                <Tooltip title={t('properties.title', 'Eigenschaften')}>
                  <IconButton
                    onClick={onOpenProperties}
                    sx={{ color: 'inherit', bgcolor: propertiesOpen ? 'rgba(255,255,255,0.14)' : undefined }}
                  >
                    <TuneIcon />
                  </IconButton>
                </Tooltip>
              )}

              {showChat && (
                <Tooltip title={t('assistant.title')}>
                  <IconButton
                    onClick={onOpenChat}
                    sx={{ color: 'inherit', bgcolor: chatOpen ? 'rgba(255,255,255,0.14)' : undefined }}
                  >
                    <ChatIcon />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={exportAnchor}
        open={Boolean(exportAnchor)}
        onClose={() => setExportAnchor(null)}
      >
        <MenuItem onClick={handleExportJson}>{t('board.exportJson')}</MenuItem>
        <MenuItem onClick={handleExportPdf}>{t('board.exportPdf')}</MenuItem>
      </Menu>

      <Menu
        anchorEl={mobileActionsAnchor}
        open={Boolean(mobileActionsAnchor)}
        onClose={closeMobileActions}
      >
        {showShare && (
          <MenuItem onClick={() => { closeMobileActions(); setShareOpen(true); }}>
            <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.share')}</ListItemText>
          </MenuItem>
        )}
        {showExport && (
          <MenuItem onClick={() => { closeMobileActions(); void handleExportJson(); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.exportJson')}</ListItemText>
          </MenuItem>
        )}
        {showExport && (
          <MenuItem onClick={() => { closeMobileActions(); void handleExportPdf(); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.exportPdf')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { closeMobileActions(); setSettingsOpen(true); }}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('app.settings')}</ListItemText>
        </MenuItem>
        {showProperties && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenProperties(); }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('properties.title', 'Eigenschaften')}</ListItemText>
          </MenuItem>
        )}
        {showChat && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenChat(); }}>
            <ListItemIcon><ChatIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('assistant.title')}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {shareOpen && board && (
        <ShareDialog boardId={board.id} onClose={() => setShareOpen(false)} />
      )}

      <AppSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
