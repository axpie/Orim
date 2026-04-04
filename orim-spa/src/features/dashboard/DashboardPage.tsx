import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import {
  getBoards,
  createBoard,
  deleteBoard,
  renameBoard,
  importBoard,
  getTemplates,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  setBoardFolder,
} from '../../api/boards';
import { getThemes } from '../../api/themes';
import {
  BoardRole,
  BoardVisibility,
  type BoardFolder,
  type BoardSummary,
  type BoardTemplateDefinition,
  type CreateBoardRequest,
} from '../../types/models';
import { useAuthStore } from '../../stores/authStore';

const MAX_RECENT_BOARDS = 5;

function favoritesStorageKey(userId: string) {
  return `orim_dashboard_favorites_${userId}`;
}

function recentBoardsStorageKey(userId: string) {
  return `orim_dashboard_recent_${userId}`;
}

function onboardingStorageKey(userId: string) {
  return `orim_dashboard_onboarding_seen_${userId}`;
}

function templatesVisibilityKey(userId: string) {
  return `orim_dashboard_templates_visible_${userId}`;
}

function loadStoredIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function persistStoredIds(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

function TemplatePreview({ templateId }: { templateId: string }) {
  const frameSx = {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'rgba(148, 163, 184, 0.08)',
    backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(241,245,249,0.78))',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  const svg = (() => {
    switch (templateId) {
      case 'welcome-board':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="16" y="14" width="38" height="20" rx="6" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <rect x="62" y="14" width="38" height="20" rx="6" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <rect x="108" y="14" width="36" height="20" rx="6" fill="#FCE7F3" stroke="#DB2777" strokeWidth="2" />
            <line x1="54" y1="24" x2="62" y2="24" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="100" y1="24" x2="108" y2="24" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <rect x="28" y="52" width="104" height="16" rx="6" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
          </svg>
        );
      case 'process-flow':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <line x1="34" y1="45" x2="62" y2="45" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="94" y1="45" x2="124" y2="45" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="22" cy="45" rx="14" ry="10" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <rect x="62" y="30" width="32" height="30" rx="7" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <polygon points="124,45 138,31 152,45 138,59" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
          </svg>
        );
      case 'org-chart':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="55" y="10" width="50" height="18" rx="6" fill="#E0E7FF" stroke="#4F46E5" strokeWidth="2" />
            <line x1="80" y1="28" x2="80" y2="44" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="35" y1="44" x2="125" y2="44" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="35" y1="44" x2="35" y2="56" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="80" y1="44" x2="80" y2="56" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="125" y1="44" x2="125" y2="56" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <rect x="15" y="56" width="40" height="18" rx="6" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <rect x="60" y="56" width="40" height="18" rx="6" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <rect x="105" y="56" width="40" height="18" rx="6" fill="#FCE7F3" stroke="#DB2777" strokeWidth="2" />
          </svg>
        );
      case 'swimlane':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="10" y="12" width="140" height="26" rx="8" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
            <rect x="10" y="52" width="140" height="26" rx="8" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
            <rect x="28" y="18" width="30" height="14" rx="5" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <rect x="72" y="18" width="30" height="14" rx="5" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
            <rect x="110" y="58" width="30" height="14" rx="5" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <line x1="58" y1="25" x2="72" y2="25" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="102" y1="25" x2="125" y2="58" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
          </svg>
        );
      case 'decision-tree':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="55" y="10" width="50" height="18" rx="6" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <line x1="80" y1="28" x2="80" y2="38" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <polygon points="80,38 96,52 80,66 64,52" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
            <line x1="64" y1="52" x2="35" y2="70" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <line x1="96" y1="52" x2="125" y2="70" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <rect x="15" y="66" width="38" height="14" rx="5" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <rect x="107" y="66" width="38" height="14" rx="5" fill="#FCE7F3" stroke="#DB2777" strokeWidth="2" />
          </svg>
        );
      case 'workshop-board':
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="18" y="14" width="34" height="22" rx="6" fill="#FCE7F3" stroke="#DB2777" strokeWidth="2" />
            <rect x="62" y="14" width="34" height="22" rx="6" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <rect x="106" y="14" width="36" height="22" rx="6" fill="#DCFCE7" stroke="#16A34A" strokeWidth="2" />
            <rect x="18" y="50" width="34" height="22" rx="6" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
            <rect x="62" y="50" width="34" height="22" rx="6" fill="#FEE2E2" stroke="#DC2626" strokeWidth="2" />
            <rect x="106" y="50" width="36" height="22" rx="6" fill="#E0E7FF" stroke="#4F46E5" strokeWidth="2" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="16" y="14" width="128" height="62" rx="12" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 6" />
            <circle cx="42" cy="33" r="4" fill="#94A3B8" />
            <circle cx="80" cy="45" r="4" fill="#94A3B8" />
            <circle cx="118" cy="57" r="4" fill="#94A3B8" />
          </svg>
        );
    }
  })();

  return <Box sx={frameSx}>{svg}</Box>;
}

interface BoardCardProps {
  board: BoardSummary;
  isOwner: boolean;
  isFavorite: boolean;
  roleLabel: string | null;
  onNavigate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveToFolder: () => void;
  onToggleFavorite: () => void;
  visibilityLabel: string;
  visibilityColor: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
  t: (key: string) => string;
}

function BoardCard({
  board,
  isOwner,
  isFavorite,
  roleLabel,
  onNavigate,
  onRename,
  onDelete,
  onMoveToFolder,
  onToggleFavorite,
  visibilityLabel,
  visibilityColor,
  draggable,
  onDragStart,
  onDragEnd,
  t,
}: BoardCardProps) {
  return (
    <Card
      sx={{ height: '100%', cursor: draggable ? 'grab' : undefined }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <CardActionArea onClick={onNavigate}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 0.75 }}>
            <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
              {board.title}
            </Typography>
            <Tooltip title={t('dashboard.favorites')}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
              >
                {isFavorite ? <StarIcon fontSize="small" color="warning" /> : <StarBorderIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Chip
              label={visibilityLabel}
              color={visibilityColor as 'default' | 'success' | 'info'}
              size="small"
              variant="outlined"
            />
            {roleLabel && (
              <Chip label={roleLabel} size="small" color="secondary" />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {board.elementCount} {t('dashboard.elements')}
          </Typography>
          {(board.tags ?? []).length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
              {(board.tags ?? []).map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
              ))}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {t('dashboard.lastModified')}: {new Date(board.updatedAt).toLocaleDateString()}
          </Typography>
        </CardContent>
      </CardActionArea>
      {isOwner && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 1 }}>
          <Tooltip title={t('dashboard.moveToFolder')}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToFolder();
              }}
            >
              <DriveFileMoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('board.rename')}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('tools.delete')}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data: boards = [], isLoading } = useQuery({
    queryKey: ['boards'],
    queryFn: getBoards,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  });
  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });
  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const createMutation = useMutation({
    mutationFn: async (params: CreateBoardRequest & { folderId?: string }) => {
      const { folderId, ...request } = params;
      const board = await createBoard(request);
      if (folderId) {
        await setBoardFolder(board.id, folderId);
      }
      return board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      rememberBoardVisit(board.id);
      navigate(`/board/${board.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBoard,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameBoard(id, title),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.setQueryData(['board', board.id], board);
    },
  });

  const importMutation = useMutation({
    mutationFn: importBoard,
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      rememberBoardVisit(board.id);
      navigate(`/board/${board.id}`);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateFolder(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: ({ id, deleteBoards }: { id: string; deleteBoards: boolean }) =>
      deleteFolder(id, deleteBoards),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      setSelectedFolderId(null);
    },
  });

  const moveFolderMutation = useMutation({
    mutationFn: ({ boardId, folderId }: { boardId: string; folderId: string | null }) =>
      setBoardFolder(boardId, folderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newThemeKey, setNewThemeKey] = useState('');
  const [newVisibility, setNewVisibility] = useState(BoardVisibility.Private);
  const [newFolderId, setNewFolderId] = useState('');

  // Templates visibility state
  const [templatesVisible, setTemplatesVisible] = useState(() => {
    if (!currentUser) return true;
    const stored = localStorage.getItem(templatesVisibilityKey(currentUser.id));
    return stored !== null ? stored === 'true' : true; // default to visible
  });

  const toggleTemplatesVisibility = useCallback(() => {
    if (!currentUser) return;
    setTemplatesVisible((prev) => {
      const next = !prev;
      localStorage.setItem(templatesVisibilityKey(currentUser.id), String(next));
      return next;
    });
  }, [currentUser]);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

  // Shared boards section collapsed by default
  const [sharedExpanded, setSharedExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Folder & tag filter state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<BoardFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<null | HTMLElement>(null);
  const [folderMenuTarget, setFolderMenuTarget] = useState<BoardFolder | null>(null);

  // Move to folder dialog state
  const [moveToFolderOpen, setMoveToFolderOpen] = useState(false);
  const [moveToFolderBoardId, setMoveToFolderBoardId] = useState('');
  const [moveToFolderSelectedId, setMoveToFolderSelectedId] = useState('');

  // Delete folder dialog state
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<BoardFolder | null>(null);

  // Drag & drop state
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const currentUserId = currentUser?.id ?? null;
  const [favoriteBoardIds, setFavoriteBoardIds] = useState<string[]>(() => currentUserId
    ? loadStoredIds(favoritesStorageKey(currentUserId))
    : []);
  const [recentBoardIds, setRecentBoardIds] = useState<string[]>(() => currentUserId
    ? loadStoredIds(recentBoardsStorageKey(currentUserId))
    : []);
  const [dismissedOnboardingUserId, setDismissedOnboardingUserId] = useState<string | null>(null);

  const getUserRole = (board: BoardSummary): BoardRole | null =>
    board.members.find((m) => m.userId === currentUser?.id)?.role ?? null;

  const roleLabel = (role: BoardRole | null) => {
    switch (role) {
      case BoardRole.Editor: return t('sharing.editor');
      case BoardRole.Viewer: return t('sharing.viewer');
      case BoardRole.Owner: return t('sharing.owner');
      default: return null;
    }
  };

  const getTemplateTitle = (template: BoardTemplateDefinition) => {
    const key = `templates.${template.titleResourceKey}`;
    const translation = t(key);
    return translation === key ? template.titleResourceKey : translation;
  };

  const getTemplateDescription = (template: BoardTemplateDefinition) => {
    const key = `templates.${template.descriptionResourceKey}`;
    const translation = t(key);
    return translation === key ? '' : translation;
  };

  const handleCreate = () => {
    createMutation.mutate({
      title: newTitle || t('board.untitled'),
      templateId: newTemplate || undefined,
      themeKey: newThemeKey || undefined,
      visibility: newVisibility,
      folderId: newFolderId || undefined,
    });
    markOnboardingSeen();
    setCreateOpen(false);
    setNewTitle('');
    setNewTemplate('');
    setNewThemeKey('');
    setNewVisibility(BoardVisibility.Private);
    setNewFolderId('');
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('dashboard.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };

  const handleRename = () => {
    const trimmedTitle = renameTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    renameMutation.mutate({ id: renameId, title: trimmedTitle });
    setRenameOpen(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importMutation.mutate({
      boardJson: text,
      title: file.name.replace(/\.json$/i, ''),
    });
    e.target.value = '';
  };

  const visibilityColor = (v: BoardVisibility) => {
    switch (v) {
      case BoardVisibility.Public: return 'success';
      case BoardVisibility.Shared: return 'info';
      default: return 'default';
    }
  };

  const visibilityLabel = useCallback((v: BoardVisibility) => {
    switch (v) {
      case BoardVisibility.Public: return t('sharing.public');
      case BoardVisibility.Shared: return t('sharing.shared');
      default: return t('sharing.private');
    }
  }, [t]);

  const favoriteBoardIdSet = useMemo(() => new Set(favoriteBoardIds), [favoriteBoardIds]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const board of boards) {
      for (const tag of board.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  }, [boards]);

  const filteredBoards = useMemo(() => {
    let result = boards;

    if (selectedFolderId) {
      result = result.filter((board: BoardSummary) => board.folderId === selectedFolderId);
    }

    if (selectedTag) {
      result = result.filter((board: BoardSummary) => (board.tags ?? []).includes(selectedTag));
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return result;
    }

    return result.filter((board: BoardSummary) => {
      const haystacks = [
        board.title,
        visibilityLabel(board.visibility),
        ...board.members.map((member) => member.username),
        ...(board.tags ?? []),
      ].map((value) => value.toLowerCase());

      return haystacks.some((value) => value.includes(normalizedSearch));
    });
  }, [boards, searchTerm, selectedFolderId, selectedTag, visibilityLabel]);

  const myBoards = filteredBoards.filter((b: BoardSummary) => b.ownerId === currentUser?.id);
  const sharedBoards = filteredBoards.filter((b: BoardSummary) => b.ownerId !== currentUser?.id);
  const favoriteBoards = filteredBoards.filter((board: BoardSummary) => favoriteBoardIdSet.has(board.id));
  const recentBoards = recentBoardIds
    .map((boardId) => boards.find((board: BoardSummary) => board.id === boardId))
    .filter((board): board is BoardSummary => Boolean(board));
  const hasSeenOnboarding = currentUserId
    ? localStorage.getItem(onboardingStorageKey(currentUserId)) === 'true'
    : true;

  const onboardingOpen = Boolean(currentUserId)
    && boards.length === 0
    && !hasSeenOnboarding
    && dismissedOnboardingUserId !== currentUserId;

  const markOnboardingSeen = () => {
    if (!currentUser?.id) {
      return;
    }

    localStorage.setItem(onboardingStorageKey(currentUser.id), 'true');
    setDismissedOnboardingUserId(currentUser.id);
  };

  const rememberBoardVisit = (boardId: string) => {
    if (!currentUser?.id) {
      return;
    }

    const next = [boardId, ...recentBoardIds.filter((id) => id !== boardId)].slice(0, MAX_RECENT_BOARDS);
    setRecentBoardIds(next);
    persistStoredIds(recentBoardsStorageKey(currentUser.id), next);
  };

  const toggleFavorite = (boardId: string) => {
    if (!currentUser?.id) {
      return;
    }

    const next = favoriteBoardIdSet.has(boardId)
      ? favoriteBoardIds.filter((id) => id !== boardId)
      : [...favoriteBoardIds, boardId];

    setFavoriteBoardIds(next);
    persistStoredIds(favoritesStorageKey(currentUser.id), next);
  };

  const handleNavigate = (boardId: string) => {
    rememberBoardVisit(boardId);
    navigate(`/board/${boardId}`);
  };

  const createBoardWithPreset = (templateId?: string) => {
    const template = templateId ? templates.find((candidate) => candidate.id === templateId) : null;
    createMutation.mutate({
      title: templateId === 'welcome-board'
        ? t('dashboard.welcomeBoardTitle')
        : template ? getTemplateTitle(template) : t('board.untitled'),
      templateId,
      visibility: BoardVisibility.Private,
    });
    markOnboardingSeen();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          {t('app.dashboard')}
        </Typography>
        <TextField
          size="small"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={t('dashboard.searchPlaceholder')}
          sx={{ minWidth: { xs: '100%', sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          component="label"
          variant="outlined"
          startIcon={<UploadFileIcon />}
        >
          {t('dashboard.import')}
          <input
            type="file"
            accept=".json"
            hidden
            onChange={handleImport}
          />
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          {t('dashboard.newBoard')}
        </Button>
      </Box>

      {/* Template Quick Start */}
      {templates.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
            onClick={toggleTemplatesVisibility}
          >
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {t('dashboard.templates')}
            </Typography>
            <IconButton size="small" aria-label={templatesVisible ? t('dashboard.hideTemplates') : t('dashboard.showTemplates')}>
              {templatesVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={templatesVisible}>
            <Grid container spacing={2}>
              {templates.map((tmpl) => (
                <Grid size={{ xs: 6, sm: 4, md: 2 }} key={tmpl.id}>
                  <Card variant="outlined" sx={{ height: '100%', textAlign: 'left' }}>
                    <CardActionArea
                      sx={{ p: 2, height: '100%', display: 'grid', gap: 1.25, alignContent: 'start' }}
                      onClick={() => {
                        setNewTemplate(tmpl.id);
                        setNewTitle(getTemplateTitle(tmpl));
                        setCreateOpen(true);
                      }}
                    >
                      <TemplatePreview templateId={tmpl.id} />
                      <Typography variant="body2" fontWeight={600}>
                        {getTemplateTitle(tmpl)}
                      </Typography>
                      {getTemplateDescription(tmpl) && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {getTemplateDescription(tmpl)}
                        </Typography>
                      )}
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Collapse>
        </Box>
      )}

      {/* Folder & Tag Filters */}
      {boards.length > 0 && (
        <Box sx={{ mb: 3 }}>
          {/* Folder chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
            <Chip
              icon={<FolderOpenIcon />}
              label={t('dashboard.allBoards')}
              variant={selectedFolderId === null && dragOverFolderId !== 'root' ? 'filled' : 'outlined'}
              color={selectedFolderId === null || dragOverFolderId === 'root' ? 'primary' : 'default'}
              onClick={() => setSelectedFolderId(null)}
              onDragOver={(e) => { if (draggingBoardId) { e.preventDefault(); setDragOverFolderId('root'); } }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={() => {
                if (draggingBoardId) {
                  moveFolderMutation.mutate({ boardId: draggingBoardId, folderId: null });
                  setDraggingBoardId(null);
                  setDragOverFolderId(null);
                }
              }}
              sx={dragOverFolderId === 'root' ? { outline: '2px solid', outlineColor: 'primary.main' } : undefined}
            />
            {folders.map((folder) => (
              <Chip
                key={folder.id}
                icon={<FolderIcon />}
                label={folder.name}
                variant={selectedFolderId === folder.id && dragOverFolderId !== folder.id ? 'filled' : 'outlined'}
                color={selectedFolderId === folder.id || dragOverFolderId === folder.id ? 'primary' : 'default'}
                onClick={() => setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id)}
                onDelete={(e) => {
                  setFolderMenuAnchor(e.currentTarget as HTMLElement);
                  setFolderMenuTarget(folder);
                }}
                deleteIcon={<MoreVertIcon />}
                onDragOver={(e) => { if (draggingBoardId) { e.preventDefault(); setDragOverFolderId(folder.id); } }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={() => {
                  if (draggingBoardId) {
                    moveFolderMutation.mutate({ boardId: draggingBoardId, folderId: folder.id });
                    setDraggingBoardId(null);
                    setDragOverFolderId(null);
                  }
                }}
                sx={dragOverFolderId === folder.id ? { outline: '2px solid', outlineColor: 'primary.main' } : undefined}
              />
            ))}
            <Chip
              icon={<AddIcon />}
              label={t('dashboard.newFolder')}
              variant="outlined"
              onClick={() => setCreateFolderOpen(true)}
            />
          </Box>
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                {t('dashboard.tags')}:
              </Typography>
              {allTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant={selectedTag === tag ? 'filled' : 'outlined'}
                  color={selectedTag === tag ? 'secondary' : 'default'}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                />
              ))}
              {selectedTag && (
                <Chip
                  label="✕"
                  size="small"
                  variant="outlined"
                  onClick={() => setSelectedTag(null)}
                />
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Folder context menu */}
      <Menu
        anchorEl={folderMenuAnchor}
        open={Boolean(folderMenuAnchor)}
        onClose={() => { setFolderMenuAnchor(null); setFolderMenuTarget(null); }}
      >
        <MenuItem onClick={() => {
          if (folderMenuTarget) {
            setRenameFolderTarget(folderMenuTarget);
            setRenameFolderName(folderMenuTarget.name);
            setRenameFolderOpen(true);
          }
          setFolderMenuAnchor(null);
          setFolderMenuTarget(null);
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('dashboard.renameFolder')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (folderMenuTarget) {
            setDeleteFolderTarget(folderMenuTarget);
            setDeleteFolderDialogOpen(true);
          }
          setFolderMenuAnchor(null);
          setFolderMenuTarget(null);
        }}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('dashboard.deleteFolder')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Board list */}
      {isLoading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : filteredBoards.length === 0 && boards.length > 0 ? (
        <Alert severity="info">{t('dashboard.searchNoResults')}</Alert>
      ) : boards.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            px: 4,
            bgcolor: 'background.paper',
            borderRadius: 2,
          }}
        >
          <Chip label={t('dashboard.startHere')} color="primary" variant="outlined" sx={{ mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {t('dashboard.emptyStateTitle')}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 680, mx: 'auto' }}>
            {t('dashboard.emptyStateDescription')}
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => createBoardWithPreset('welcome-board')}>
              {t('dashboard.guidedStart')}
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => createBoardWithPreset()}>
              {t('dashboard.createBoard')}
            </Button>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
              {t('dashboard.import')}
              <input type="file" accept=".json" hidden onChange={handleImport} />
            </Button>
          </Box>
        </Box>
      ) : (
        <Box>
          {recentBoards.length > 0 && (
            <>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                {t('dashboard.recentBoards')}
              </Typography>
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {recentBoards.map((board) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={board.id}>
                    <BoardCard
                      board={board}
                      isOwner={board.ownerId === currentUser?.id}
                      isFavorite={favoriteBoardIdSet.has(board.id)}
                      roleLabel={board.ownerId === currentUser?.id ? null : roleLabel(getUserRole(board))}
                      onNavigate={() => handleNavigate(board.id)}
                      onRename={() => {
                        setRenameId(board.id);
                        setRenameTitle(board.title);
                        setRenameOpen(true);
                      }}
                      onDelete={() => handleDelete(board.id)}
                      onMoveToFolder={() => {
                        setMoveToFolderBoardId(board.id);
                        setMoveToFolderSelectedId(board.folderId ?? '');
                        setMoveToFolderOpen(true);
                      }}
                      onToggleFavorite={() => toggleFavorite(board.id)}
                      visibilityLabel={visibilityLabel(board.visibility)}
                      visibilityColor={visibilityColor(board.visibility)}
                      draggable={board.ownerId === currentUser?.id}
                      onDragStart={() => setDraggingBoardId(board.id)}
                      onDragEnd={() => { setDraggingBoardId(null); setDragOverFolderId(null); }}
                      t={t}
                    />
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          {favoriteBoards.length > 0 && (
            <>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                {t('dashboard.favorites')}
              </Typography>
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {favoriteBoards.map((board) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={board.id}>
                    <BoardCard
                      board={board}
                      isOwner={board.ownerId === currentUser?.id}
                      isFavorite={favoriteBoardIdSet.has(board.id)}
                      roleLabel={board.ownerId === currentUser?.id ? null : roleLabel(getUserRole(board))}
                      onNavigate={() => handleNavigate(board.id)}
                      onRename={() => {
                        setRenameId(board.id);
                        setRenameTitle(board.title);
                        setRenameOpen(true);
                      }}
                      onDelete={() => handleDelete(board.id)}
                      onMoveToFolder={() => {
                        setMoveToFolderBoardId(board.id);
                        setMoveToFolderSelectedId(board.folderId ?? '');
                        setMoveToFolderOpen(true);
                      }}
                      onToggleFavorite={() => toggleFavorite(board.id)}
                      visibilityLabel={visibilityLabel(board.visibility)}
                      visibilityColor={visibilityColor(board.visibility)}
                      draggable={board.ownerId === currentUser?.id}
                      onDragStart={() => setDraggingBoardId(board.id)}
                      onDragEnd={() => { setDraggingBoardId(null); setDragOverFolderId(null); }}
                      t={t}
                    />
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          {/* My Boards */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            {t('dashboard.myBoards')}
          </Typography>
          {myBoards.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t('dashboard.noOwnBoards')}
            </Typography>
          ) : (
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {myBoards.map((board: BoardSummary) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={board.id}>
                  <BoardCard
                    board={board}
                    isOwner={true}
                    isFavorite={favoriteBoardIdSet.has(board.id)}
                    roleLabel={null}
                    onNavigate={() => handleNavigate(board.id)}
                    onRename={() => {
                      setRenameId(board.id);
                      setRenameTitle(board.title);
                      setRenameOpen(true);
                    }}
                    onDelete={() => handleDelete(board.id)}
                    onMoveToFolder={() => {
                      setMoveToFolderBoardId(board.id);
                      setMoveToFolderSelectedId(board.folderId ?? '');
                      setMoveToFolderOpen(true);
                    }}
                    onToggleFavorite={() => toggleFavorite(board.id)}
                    visibilityLabel={visibilityLabel(board.visibility)}
                    visibilityColor={visibilityColor(board.visibility)}
                    draggable
                    onDragStart={() => setDraggingBoardId(board.id)}
                    onDragEnd={() => { setDraggingBoardId(null); setDragOverFolderId(null); }}
                    t={t}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Shared with Me */}
          <Box
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1.5 }}
            onClick={() => setSharedExpanded((v) => !v)}
          >
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {t('dashboard.sharedWithMe')}
              {sharedBoards.length > 0 && (
                <Chip label={sharedBoards.length} size="small" sx={{ ml: 1 }} />
              )}
            </Typography>
            <IconButton size="small">
              {sharedExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={sharedExpanded}>
            {sharedBoards.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {t('dashboard.noSharedBoards')}
              </Typography>
            ) : (
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {sharedBoards.map((board: BoardSummary) => {
                  const role = getUserRole(board);
                  return (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={board.id}>
                      <BoardCard
                        board={board}
                        isOwner={false}
                        isFavorite={favoriteBoardIdSet.has(board.id)}
                        roleLabel={roleLabel(role)}
                        onNavigate={() => handleNavigate(board.id)}
                        onRename={() => {}}
                        onDelete={() => {}}
                        onMoveToFolder={() => {}}
                        onToggleFavorite={() => toggleFavorite(board.id)}
                        visibilityLabel={visibilityLabel(board.visibility)}
                        visibilityColor={visibilityColor(board.visibility)}
                        t={t}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Collapse>
        </Box>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboard.createBoard')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('dashboard.boardTitle')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            select
            label={t('dashboard.template')}
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value="">—</MenuItem>
            {templates.map((tmpl) => (
              <MenuItem key={tmpl.id} value={tmpl.id}>
                {getTemplateTitle(tmpl)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('boardSettings.boardTheme', 'Board-Theme')}
            value={newThemeKey}
            onChange={(e) => setNewThemeKey(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value="">{t('boardSettings.noFixedTheme', '— Persönliches Theme —')}</MenuItem>
            {themes.filter((theme) => theme.isEnabled).map((theme) => (
              <MenuItem key={theme.key} value={theme.key}>
                {theme.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('sharing.visibility')}
            value={newVisibility}
            onChange={(e) => setNewVisibility(e.target.value as BoardVisibility)}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value={BoardVisibility.Private}>{t('sharing.private')}</MenuItem>
            <MenuItem value={BoardVisibility.Public}>{t('sharing.public')}</MenuItem>
          </TextField>
          {folders.length > 0 && (
            <TextField
              select
              label={t('dashboard.folder')}
              value={newFolderId}
              onChange={(e) => setNewFolderId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">{t('dashboard.noFolder')}</MenuItem>
              {folders.map((folder) => (
                <MenuItem key={folder.id} value={folder.id}>
                  {folder.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate}>
            {t('dashboard.createBoard')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('board.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('dashboard.boardTitle')}
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleRename}>
            {t('board.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={onboardingOpen} onClose={markOnboardingSeen} maxWidth="sm" fullWidth>
        <DialogTitle>{t('dashboard.onboardingTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('dashboard.onboardingDescription')}
          </DialogContentText>
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <Typography variant="body2">{t('dashboard.onboardingValue1')}</Typography>
            <Typography variant="body2">{t('dashboard.onboardingValue2')}</Typography>
            <Typography variant="body2">{t('dashboard.onboardingValue3')}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <Button variant="contained" onClick={() => createBoardWithPreset('welcome-board')}>
            {t('dashboard.guidedStart')}
          </Button>
          <Button variant="outlined" onClick={() => createBoardWithPreset()}>
            {t('dashboard.createBoard')}
          </Button>
          <Button onClick={() => { markOnboardingSeen(); setCreateOpen(true); }}>
            {t('dashboard.browseTemplates')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboard.newFolder')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('dashboard.folderName')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={() => {
            const trimmed = newFolderName.trim();
            if (trimmed) {
              createFolderMutation.mutate(trimmed);
              setNewFolderName('');
              setCreateFolderOpen(false);
            }
          }}>
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={renameFolderOpen} onClose={() => setRenameFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboard.renameFolder')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('dashboard.folderName')}
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFolderOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={() => {
            const trimmed = renameFolderName.trim();
            if (trimmed && renameFolderTarget) {
              renameFolderMutation.mutate({ id: renameFolderTarget.id, name: trimmed });
              setRenameFolderOpen(false);
              setRenameFolderTarget(null);
            }
          }}>
            {t('board.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={moveToFolderOpen} onClose={() => setMoveToFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboard.moveToFolder')}</DialogTitle>
        <DialogContent>
          <TextField
            select
            label={t('dashboard.selectFolder')}
            value={moveToFolderSelectedId}
            onChange={(e) => setMoveToFolderSelectedId(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
          >
            <MenuItem value="">{t('dashboard.noFolder')}</MenuItem>
            {folders.map((folder) => (
              <MenuItem key={folder.id} value={folder.id}>
                {folder.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveToFolderOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              moveFolderMutation.mutate({
                boardId: moveToFolderBoardId,
                folderId: moveToFolderSelectedId || null,
              });
              setMoveToFolderOpen(false);
            }}
          >
            {t('board.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete folder dialog */}
      <Dialog open={deleteFolderDialogOpen} onClose={() => setDeleteFolderDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboard.deleteFolderTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            <strong>{deleteFolderTarget?.name}</strong>
          </Typography>
          <Stack spacing={1.5}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                if (deleteFolderTarget) deleteFolderMutation.mutate({ id: deleteFolderTarget.id, deleteBoards: false });
                setDeleteFolderDialogOpen(false);
                setDeleteFolderTarget(null);
              }}
            >
              <Box sx={{ textAlign: 'left', width: '100%' }}>
                <Typography variant="body1">{t('dashboard.deleteFolderOnly')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('dashboard.deleteFolderOnlyHint')}</Typography>
              </Box>
            </Button>
            <Button
              variant="outlined"
              color="error"
              fullWidth
              onClick={() => {
                if (deleteFolderTarget) deleteFolderMutation.mutate({ id: deleteFolderTarget.id, deleteBoards: true });
                setDeleteFolderDialogOpen(false);
                setDeleteFolderTarget(null);
              }}
            >
              <Box sx={{ textAlign: 'left', width: '100%' }}>
                <Typography variant="body1">{t('dashboard.deleteFolderAndBoards')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('dashboard.deleteFolderAndBoardsHint')}</Typography>
              </Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteFolderDialogOpen(false); setDeleteFolderTarget(null); }}>
            {t('common.cancel')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
