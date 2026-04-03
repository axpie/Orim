import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Badge,
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
import ModeCommentOutlinedIcon from '@mui/icons-material/ModeCommentOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import TuneIcon from '@mui/icons-material/Tune';
import ShareIcon from '@mui/icons-material/Share';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { useBoardStore } from '../store/boardStore';
import { AppSettingsDialog } from '../../../components/dialogs/AppSettingsDialog';
import { exportBoardJson, exportBoardPdf } from '../../../api/boards';
import { ShareDialog } from '../../sharing/ShareDialog';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { BoardSettingsDialog } from '../panels/BoardSettingsDialog';
import type { BoardSyncStatus, CursorPresence } from '../../../types/models';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createBoardMetadataUpdatedOperation } from '../realtime/boardOperations';

function createBoardFileName(title: string | undefined, extension: string) {
  const baseName = (title?.trim() || 'board').replace(/[\\/:*?"<>|]+/g, '-');
  return `${baseName}.${extension}`;
}

interface BoardTopBarProps {
  onOpenProperties: () => void;
  onOpenComments: () => void;
  onOpenChat: () => void;
  propertiesOpen: boolean;
  commentsOpen: boolean;
  chatOpen: boolean;
  syncStatus: BoardSyncStatus;
  titleEditable?: boolean;
  showShare?: boolean;
  showExport?: boolean;
  showSnapshots?: boolean;
  showProperties?: boolean;
  showComments?: boolean;
  showChat?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  onRenameTitle?: (title: string, previousTitle: string) => void;
  onOpenSnapshots?: () => void;
  onExportPng?: () => Promise<void> | void;
  collaborators?: CursorPresence[];
  localConnectionId?: string | null;
}

export function BoardTopBar({
  onOpenProperties,
  onOpenComments,
  onOpenChat,
  propertiesOpen,
  commentsOpen,
  chatOpen,
  syncStatus,
  titleEditable = true,
  showShare = true,
  showExport = true,
  showSnapshots = false,
  showProperties = true,
  showComments = false,
  showChat = true,
  showBackButton = true,
  onBack,
  onBoardChanged,
  onRenameTitle,
  onOpenSnapshots,
  onExportPng,
  collaborators = [],
  localConnectionId = null,
}: BoardTopBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const board = useBoardStore((s) => s.board);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const updateBoard = useBoardStore((s) => s.updateBoard);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
    const trimmedTitle = title.trim();
    const previousTitle = board?.title ?? '';

    if (trimmedTitle && trimmedTitle !== previousTitle) {
      if (onRenameTitle) {
        setBoardTitle(trimmedTitle);
        onRenameTitle(trimmedTitle, previousTitle);
        return;
      }

      updateBoard({ title: trimmedTitle });
      if (board) {
        onBoardChanged?.('Metadata', createBoardMetadataUpdatedOperation({
          title: trimmedTitle,
          labelOutlineEnabled: board.labelOutlineEnabled,
          arrowOutlineEnabled: board.arrowOutlineEnabled,
          surfaceColor: board.surfaceColor,
          themeKey: board.themeKey,
          customColors: board.customColors,
          recentColors: board.recentColors,
          stickyNotePresets: board.stickyNotePresets,
        }));
      }
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
    a.download = createBoardFileName(board.title, 'json');
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
    a.download = createBoardFileName(board.title, 'pdf');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    if (!onExportPng) return;
    setExportAnchor(null);
    await onExportPng();
  };

  const closeMobileActions = () => setMobileActionsAnchor(null);
  const closeSettingsMenu = () => setSettingsMenuAnchor(null);

  const openSettingsMenu = (event: MouseEvent<HTMLElement>) => {
    setSettingsMenuAnchor(event.currentTarget);
  };

  const compactCollaborators = collaborators.length > 0
    ? collaborators.filter((collaborator) => collaborator.clientId !== localConnectionId).length
    : 0;
  const commentCount = board?.comments?.length ?? 0;
  const statusLabelKey = (() => {
    switch (syncStatus.kind) {
      case 'saving':
        return 'board.saving';
      case 'unsaved':
        return 'board.statusUnsaved';
      case 'unsyncedChanges':
        return 'board.statusUnsyncedChanges';
      case 'connecting':
        return 'board.statusConnecting';
      case 'reconnecting':
        return 'board.statusReconnecting';
      case 'offline':
        return 'board.statusOffline';
      case 'saveError':
        return 'board.statusSaveError';
      case 'connectionError':
        return 'board.statusConnectionError';
      case 'saved':
      default:
        return 'board.saved';
    }
  })();
  const baseStatusLabel = t(statusLabelKey);
  const statusLabel = syncStatus.hasPendingChanges && !['saving', 'unsaved', 'unsyncedChanges', 'saveError'].includes(syncStatus.kind)
    ? `${baseStatusLabel} · ${t('board.statusUnsaved')}`
    : baseStatusLabel;
  const statusTooltip = syncStatus.detail
    ? t('board.lastError', { message: syncStatus.detail })
    : statusLabel;
  const queuedChangesLabel = syncStatus.queuedChangesCount && syncStatus.queuedChangesCount > 0
    ? t('board.unsyncedChangesCount', {
        count: syncStatus.queuedChangesCount,
        defaultValue: '{{count}} unsynced changes',
      })
    : null;
  const statusColor = (() => {
    switch (syncStatus.kind) {
      case 'saved':
        return 'success' as const;
      case 'saving':
        return 'info' as const;
      case 'unsaved':
      case 'unsyncedChanges':
      case 'reconnecting':
        return 'warning' as const;
      case 'offline':
      case 'saveError':
      case 'connectionError':
        return 'error' as const;
      case 'connecting':
      default:
        return 'default' as const;
    }
  })();
  const statusIcon: ReactNode = ['saving', 'connecting', 'reconnecting'].includes(syncStatus.kind)
    ? <CircularProgress size={14} thickness={5} color="inherit" />
    : syncStatus.kind === 'saved'
      ? <CheckCircleIcon fontSize="small" />
      : ['offline', 'saveError', 'connectionError'].includes(syncStatus.kind)
        ? <ErrorOutlineIcon fontSize="small" />
        : undefined;

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

          <Tooltip title={statusTooltip}>
            <Chip
              size="small"
              color={statusColor}
              label={statusLabel}
              icon={statusIcon}
              variant={statusColor === 'default' ? 'outlined' : 'filled'}
              sx={{ ml: 1, maxWidth: { xs: 180, sm: 240 } }}
            />
          </Tooltip>
          {queuedChangesLabel && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={queuedChangesLabel}
              sx={{ ml: 1 }}
            />
          )}

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
                    '& .MuiChip-avatar': {
                      width: 10,
                      height: 10,
                      minWidth: 10,
                      minHeight: 10,
                      display: 'block',
                      flexShrink: 0,
                      aspectRatio: '1 / 1',
                      marginLeft: 1,
                      marginRight: 0.75,
                    },
                    '& .MuiChip-label': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  }}
                  avatar={<Box component="span" sx={{ borderRadius: '50%', bgcolor: collaborator.colorHex }} />}
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

              {showSnapshots && onOpenSnapshots && (
                <Tooltip title={t('board.snapshots')}>
                  <IconButton onClick={onOpenSnapshots} sx={{ color: 'inherit' }}>
                    <HistoryIcon />
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title={t('shortcuts.open')}>
                <IconButton onClick={() => setShortcutsOpen(true)} sx={{ color: 'inherit' }}>
                  <KeyboardIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title={t('app.settings')}>
                <IconButton
                  onClick={openSettingsMenu}
                  sx={{ color: 'inherit', bgcolor: settingsMenuAnchor ? 'rgba(255,255,255,0.14)' : undefined }}
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

              {showComments && (
                <Tooltip title={t('comments.title')}>
                  <IconButton
                    onClick={onOpenComments}
                    sx={{ color: 'inherit', bgcolor: commentsOpen ? 'rgba(255,255,255,0.14)' : undefined }}
                  >
                    <Badge badgeContent={commentCount} color="secondary" max={99}>
                      <ModeCommentOutlinedIcon />
                    </Badge>
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
        {onExportPng && (
          <MenuItem onClick={handleExportPng}>{t('board.exportPng')}</MenuItem>
        )}
        <MenuItem onClick={handleExportPdf}>{t('board.exportPdf')}</MenuItem>
        <MenuItem onClick={handleExportJson}>{t('board.exportJson')}</MenuItem>
      </Menu>

      <Menu
        anchorEl={settingsMenuAnchor}
        open={Boolean(settingsMenuAnchor)}
        onClose={closeSettingsMenu}
      >
        {titleEditable && (
          <MenuItem onClick={() => { closeSettingsMenu(); setBoardSettingsOpen(true); }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('boardSettings.title')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { closeSettingsMenu(); setAppSettingsOpen(true); }}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('app.settings')}</ListItemText>
        </MenuItem>
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
          onExportPng && (
            <MenuItem onClick={() => { closeMobileActions(); void handleExportPng(); }}>
              <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('board.exportPng')}</ListItemText>
            </MenuItem>
          )
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
        {showSnapshots && onOpenSnapshots && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenSnapshots(); }}>
            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.snapshots')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { closeMobileActions(); setShortcutsOpen(true); }}>
          <ListItemIcon><KeyboardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('shortcuts.open')}</ListItemText>
        </MenuItem>
        {titleEditable && (
          <MenuItem onClick={() => { closeMobileActions(); setBoardSettingsOpen(true); }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('boardSettings.title')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { closeMobileActions(); setAppSettingsOpen(true); }}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('app.settings')}</ListItemText>
        </MenuItem>
        {showProperties && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenProperties(); }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('properties.title', 'Eigenschaften')}</ListItemText>
          </MenuItem>
        )}
        {showComments && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenComments(); }}>
            <ListItemIcon>
              <Badge badgeContent={commentCount} color="secondary" max={99}>
                <ModeCommentOutlinedIcon fontSize="small" />
              </Badge>
            </ListItemIcon>
            <ListItemText>{t('comments.title')}</ListItemText>
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

      <ShortcutHelpDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <BoardSettingsDialog
        open={boardSettingsOpen}
        onClose={() => setBoardSettingsOpen(false)}
        onBoardChanged={onBoardChanged}
      />

      <AppSettingsDialog open={appSettingsOpen} onClose={() => setAppSettingsOpen(false)} />
    </>
  );
}
