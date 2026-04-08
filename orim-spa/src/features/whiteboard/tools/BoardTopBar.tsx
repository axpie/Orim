import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Avatar,
  AvatarGroup,
  Badge,
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
import HistoryIcon from '@mui/icons-material/History';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import NearMeIcon from '@mui/icons-material/NearMe';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useBoardStore } from '../store/boardStore';
import { AppSettingsDialog, type AppSettingsDialogScope } from '../../../components/dialogs/AppSettingsDialog';
import { exportBoardJson } from '../../../api/boards';
import { ShareDialog } from '../../sharing/ShareDialog';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { BoardSettingsDialog } from '../panels/BoardSettingsDialog';
import type { BoardSyncStatus, CursorPresence } from '../../../types/models';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { createBoardMetadataUpdatedOperation } from '../realtime/boardOperations';
import { getCenteredCameraPosition } from '../cameraUtils';

function createBoardFileName(title: string | undefined, extension: string) {
  const baseName = (title?.trim() || 'board').replace(/[\\/:*?"<>|]+/g, '-');
  return `${baseName}.${extension}`;
}

interface BoardTopBarProps {
  onOpenProperties: () => void;
  onOpenChat: () => void;
  propertiesOpen: boolean;
  chatOpen: boolean;
  syncStatus: BoardSyncStatus;
  titleEditable?: boolean;
  showShare?: boolean;
  showExport?: boolean;
  showSnapshots?: boolean;
  showProperties?: boolean;
  showChat?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  onRenameTitle?: (title: string, previousTitle: string) => void;
  onOpenSnapshots?: () => void;
  onExportPng?: () => Promise<void> | void;
  onStartPresentation?: () => void;
  hasFrames?: boolean;
  collaborators?: CursorPresence[];
  localConnectionId?: string | null;
  appSettingsScope?: AppSettingsDialogScope;
}

export function BoardTopBar({
  onOpenProperties,
  onOpenChat,
  propertiesOpen,
  chatOpen,
  syncStatus,
  titleEditable = true,
  showShare = true,
  showExport = true,
  showSnapshots = false,
  showProperties = true,
  showChat = true,
  showBackButton = true,
  onBack,
  onBoardChanged,
  onRenameTitle,
  onOpenSnapshots,
  onExportPng,
  onStartPresentation,
  hasFrames = false,
  collaborators = [],
  localConnectionId = null,
  appSettingsScope = 'full',
}: BoardTopBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const board = useBoardStore((s) => s.board);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const setCamera = useBoardStore((s) => s.setCamera);
  const followingClientId = useBoardStore((s) => s.followingClientId);
  const setFollowingClientId = useBoardStore((s) => s.setFollowingClientId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileActionsAnchor, setMobileActionsAnchor] = useState<null | HTMLElement>(null);
  const [followMenuAnchor, setFollowMenuAnchor] = useState<null | HTMLElement>(null);
  const [followMenuTarget, setFollowMenuTarget] = useState<CursorPresence | null>(null);
  const [peopleMenuAnchor, setPeopleMenuAnchor] = useState<null | HTMLElement>(null);

  const remoteCollaborators = collaborators.filter((c) => c.clientId !== localConnectionId);

  const centerOnCollaborator = (collaborator: CursorPresence) => {
    if (collaborator.worldX == null || collaborator.worldY == null) return;
    const { zoom, viewportWidth, viewportHeight } = useBoardStore.getState();
    const { cameraX, cameraY } = getCenteredCameraPosition(
      collaborator.worldX,
      collaborator.worldY,
      zoom,
      viewportWidth,
      viewportHeight,
    );
    setCamera(cameraX, cameraY);
  };

  const handleAvatarClick = (collaborator: CursorPresence) => {
    centerOnCollaborator(collaborator);
  };

  const handleAvatarContextMenu = (event: MouseEvent<HTMLElement>, collaborator: CursorPresence) => {
    event.preventDefault();
    setFollowMenuAnchor(event.currentTarget);
    setFollowMenuTarget(collaborator);
  };

  const handleFollowUser = () => {
    if (followMenuTarget) {
      setFollowingClientId(followMenuTarget.clientId);
      centerOnCollaborator(followMenuTarget);
    }
    setFollowMenuAnchor(null);
    setFollowMenuTarget(null);
  };

  const closeFollowMenu = () => {
    setFollowMenuAnchor(null);
    setFollowMenuTarget(null);
  };

  const closePeopleMenu = () => {
    setPeopleMenuAnchor(null);
  };

  const handleJumpToUser = (collaborator: CursorPresence) => {
    centerOnCollaborator(collaborator);
    closePeopleMenu();
  };

  const handleFollowUserFromList = (collaborator: CursorPresence) => {
    if (followingClientId === collaborator.clientId) {
      setFollowingClientId(null);
    } else {
      setFollowingClientId(collaborator.clientId);
      centerOnCollaborator(collaborator);
    }
    closePeopleMenu();
  };

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
          enabledIconGroups: board.enabledIconGroups,
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

          {remoteCollaborators.length > 0 && (
            <Tooltip title={t('board.peopleMenu', 'Teilnehmer')}>
              <IconButton onClick={(event) => setPeopleMenuAnchor(event.currentTarget)} sx={{ color: 'inherit', mr: 0.5 }}>
                <Badge badgeContent={remoteCollaborators.length} color="secondary" max={99}>
                  <PeopleAltIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          )}

          {!isCompact && remoteCollaborators.length > 0 && (
            <AvatarGroup
              max={6}
              sx={{
                mr: 2,
                '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 13, cursor: 'pointer' },
              }}
            >
              {remoteCollaborators.slice(0, 5).map((collaborator) => (
                <Tooltip key={collaborator.clientId} title={collaborator.displayName}>
                  <Avatar
                    sx={{
                      bgcolor: collaborator.colorHex,
                      border: followingClientId === collaborator.clientId
                        ? '2px solid'
                        : undefined,
                      borderColor: followingClientId === collaborator.clientId
                        ? 'primary.main'
                        : undefined,
                    }}
                    onClick={() => handleAvatarClick(collaborator)}
                    onContextMenu={(e) => handleAvatarContextMenu(e, collaborator)}
                  >
                    {collaborator.displayName.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
              ))}
              {remoteCollaborators.length > 5 && (
                <Avatar sx={{ bgcolor: 'grey.600' }}>+{remoteCollaborators.length - 5}</Avatar>
              )}
            </AvatarGroup>
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

              {onStartPresentation && (
                <Tooltip title={t('board.present', 'Präsentieren')}>
                  <span>
                    <IconButton onClick={onStartPresentation} disabled={!hasFrames} sx={{ color: 'inherit' }}>
                      <SlideshowIcon />
                    </IconButton>
                  </span>
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
        {onStartPresentation && (
          <MenuItem onClick={() => { closeSettingsMenu(); onStartPresentation(); }} disabled={!hasFrames}>
            <ListItemIcon><SlideshowIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.present', 'Present')}</ListItemText>
          </MenuItem>
        )}
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
        {showSnapshots && onOpenSnapshots && (
          <MenuItem onClick={() => { closeMobileActions(); onOpenSnapshots(); }}>
            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.snapshots')}</ListItemText>
          </MenuItem>
        )}
        {onStartPresentation && (
          <MenuItem onClick={() => { closeMobileActions(); onStartPresentation(); }} disabled={!hasFrames}>
            <ListItemIcon><SlideshowIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.present', 'Präsentieren')}</ListItemText>
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

      <AppSettingsDialog open={appSettingsOpen} onClose={() => setAppSettingsOpen(false)} scope={appSettingsScope} />

      <Menu
        anchorEl={followMenuAnchor}
        open={Boolean(followMenuAnchor)}
        onClose={closeFollowMenu}
      >
        {followMenuTarget && (
          <MenuItem onClick={handleFollowUser}>
            <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('board.followUser', { name: followMenuTarget.displayName, defaultValue: 'Follow {{name}}' })}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Menu
        anchorEl={peopleMenuAnchor}
        open={Boolean(peopleMenuAnchor)}
        onClose={closePeopleMenu}
      >
        {remoteCollaborators.length === 0 ? (
          <MenuItem disabled>{t('board.noActiveCollaborators', 'Keine aktiven Teilnehmer')}</MenuItem>
        ) : remoteCollaborators.map((collaborator, index) => (
          <Box key={collaborator.clientId} sx={{ minWidth: 280 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, pt: 1.5, pb: 0.5 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: collaborator.colorHex }}>
                {collaborator.displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {collaborator.displayName}
                </Typography>
                {followingClientId === collaborator.clientId && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {t('board.followingUser', { name: collaborator.displayName, defaultValue: 'Following {{name}}' })}
                  </Typography>
                )}
              </Box>
            </Box>
            <MenuItem onClick={() => handleJumpToUser(collaborator)}>
              <ListItemIcon><NearMeIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('board.jumpToUser', { name: collaborator.displayName, defaultValue: 'Jump to {{name}}' })}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleFollowUserFromList(collaborator)}>
              <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
              <ListItemText>
                {followingClientId === collaborator.clientId
                  ? t('board.stopFollowing', 'Stop following')
                  : t('board.followUser', { name: collaborator.displayName, defaultValue: 'Follow {{name}}' })}
              </ListItemText>
            </MenuItem>
            {index < remoteCollaborators.length - 1 && <Divider />}
          </Box>
        ))}
      </Menu>
    </>
  );
}
