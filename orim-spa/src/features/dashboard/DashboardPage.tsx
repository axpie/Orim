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
import {
  getBoards,
  createBoard,
  deleteBoard,
  updateBoard,
  importBoard,
  getTemplates,
} from '../../api/boards';
import {
  BoardVisibility,
  type BoardSummary,
  type BoardTemplateDefinition,
} from '../../types/models';
import { useAuthStore } from '../../stores/authStore';

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
  const [newVisibility, setNewVisibility] = useState(BoardVisibility.Private);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

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
      visibility: newVisibility,
    });
    setCreateOpen(false);
    setNewTitle('');
    setNewTemplate('');
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
                <Card variant="outlined" sx={{ textAlign: 'center' }}>
                  <CardActionArea
                    sx={{ p: 2 }}
                    onClick={() => {
                      setNewTemplate(tmpl.id);
                      setNewTitle(getTemplateTitle(tmpl));
                      setCreateOpen(true);
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {getTemplateTitle(tmpl)}
                    </Typography>
                    {getTemplateDescription(tmpl) && (
                      <Typography variant="caption" color="text.secondary">
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
        <Grid container spacing={2}>
          {boards.map((board: BoardSummary) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={board.id}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea onClick={() => navigate(`/board/${board.id}`)}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }} noWrap>
                        {board.title}
                      </Typography>
                      <Chip
                        label={visibilityLabel(board.visibility)}
                        color={visibilityColor(board.visibility) as 'default' | 'success' | 'info'}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {board.elementCount} {t('dashboard.elements')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('dashboard.lastModified')}: {new Date(board.updatedAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
                {board.ownerId === currentUser?.id && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 1 }}>
                    <Tooltip title={t('board.rename')}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameId(board.id);
                          setRenameTitle(board.title);
                          setRenameOpen(true);
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
                          handleDelete(board.id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
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
          <Button onClick={() => setCreateOpen(false)}>{t('tools.select')}</Button>
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
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRename}>
            {t('board.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
