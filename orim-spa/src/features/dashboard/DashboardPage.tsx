import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  getBoards,
  createBoard,
  deleteBoard,
  updateBoard,
  importBoard,
  getTemplates,
} from '../../api/boards';
import { getThemes } from '../../api/themes';
import {
  BoardRole,
  BoardVisibility,
  type BoardSummary,
  type BoardTemplateDefinition,
} from '../../types/models';
import { useAuthStore } from '../../stores/authStore';

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
  roleLabel: string | null;
  onNavigate: () => void;
  onRename: () => void;
  onDelete: () => void;
  visibilityLabel: string;
  visibilityColor: string;
  t: (key: string) => string;
}

function BoardCard({ board, isOwner, roleLabel, onNavigate, onRename, onDelete, visibilityLabel, visibilityColor, t }: BoardCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea onClick={onNavigate}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 0.75 }}>
            <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
              {board.title}
            </Typography>
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
          <Typography variant="caption" color="text.secondary">
            {t('dashboard.lastModified')}: {new Date(board.updatedAt).toLocaleDateString()}
          </Typography>
        </CardContent>
      </CardActionArea>
      {isOwner && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 1 }}>
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

  const createMutation = useMutation({
    mutationFn: createBoard,
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate(`/board/${board.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBoard,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateBoard(id, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  const importMutation = useMutation({
    mutationFn: importBoard,
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate(`/board/${board.id}`);
    },
  });

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newThemeKey, setNewThemeKey] = useState('');
  const [newVisibility, setNewVisibility] = useState(BoardVisibility.Private);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

  // Shared boards section collapsed by default
  const [sharedExpanded, setSharedExpanded] = useState(false);

  const myBoards = boards.filter((b: BoardSummary) => b.ownerId === currentUser?.id);
  const sharedBoards = boards.filter((b: BoardSummary) => b.ownerId !== currentUser?.id);

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
    });
    setCreateOpen(false);
    setNewTitle('');
    setNewTemplate('');
    setNewThemeKey('');
    setNewVisibility(BoardVisibility.Private);
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('dashboard.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };

  const handleRename = () => {
    renameMutation.mutate({ id: renameId, title: renameTitle });
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

  const visibilityLabel = (v: BoardVisibility) => {
    switch (v) {
      case BoardVisibility.Public: return t('sharing.public');
      case BoardVisibility.Shared: return t('sharing.shared');
      default: return t('sharing.private');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          {t('app.dashboard')}
        </Typography>
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
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            {t('dashboard.templates')}
          </Typography>
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
        </Box>
      )}

      {/* Board list */}
      {isLoading ? (
        <Typography color="text.secondary">Loading...</Typography>
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
          <Typography variant="h6" gutterBottom>
            {t('dashboard.noBoards')}
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
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
                    roleLabel={null}
                    onNavigate={() => navigate(`/board/${board.id}`)}
                    onRename={() => {
                      setRenameId(board.id);
                      setRenameTitle(board.title);
                      setRenameOpen(true);
                    }}
                    onDelete={() => handleDelete(board.id)}
                    visibilityLabel={visibilityLabel(board.visibility)}
                    visibilityColor={visibilityColor(board.visibility)}
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
                        roleLabel={roleLabel(role)}
                        onNavigate={() => navigate(`/board/${board.id}`)}
                        onRename={() => {}}
                        onDelete={() => {}}
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
          >
            <MenuItem value={BoardVisibility.Private}>{t('sharing.private')}</MenuItem>
            <MenuItem value={BoardVisibility.Public}>{t('sharing.public')}</MenuItem>
          </TextField>
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
    </Box>
  );
}
