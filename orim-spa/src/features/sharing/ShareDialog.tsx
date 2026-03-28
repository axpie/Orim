import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Divider,
  InputAdornment,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getBoard,
  setVisibility,
  generateShareToken,
  setSharePassword,
  addMember,
  removeMember,
  updateMemberRole,
} from '../../api/boards';
import { BoardVisibility, BoardRole } from '../../types/models';

interface ShareDialogProps {
  boardId: string;
  onClose: () => void;
}

export function ShareDialog({ boardId, onClose }: ShareDialogProps) {
  const { t } = useTranslation();

  const { data: board, refetch } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => getBoard(boardId),
  });

  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (board?.shareLinkToken) {
      setShareLink(`${window.location.origin}/shared/${board.shareLinkToken}`);
    }
  }, [board?.shareLinkToken]);

  const visibilityMutation = useMutation({
    mutationFn: ({ visibility, allowAnonymousEditing }: { visibility: BoardVisibility; allowAnonymousEditing: boolean }) =>
      setVisibility(boardId, visibility, allowAnonymousEditing),
    onSuccess: () => refetch(),
  });

  const shareTokenMutation = useMutation({
    mutationFn: () => generateShareToken(boardId),
    onSuccess: (data) => {
      const url = `${window.location.origin}/shared/${data.shareLinkToken}`;
      setShareLink(url);
      refetch();
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (pw: string | null) => setSharePassword(boardId, pw),
    onSuccess: () => refetch(),
  });

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addMember(boardId, userId, BoardRole.Editor),
    onSuccess: () => {
      setNewMember('');
      refetch();
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeMember(boardId, userId),
    onSuccess: () => refetch(),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
      updateMemberRole(boardId, userId, role),
    onSuccess: () => refetch(),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!board) return null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('board.share')}</DialogTitle>
      <DialogContent>
        {/* Visibility */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('sharing.visibility')}
          </Typography>
          <Select
            size="small"
            fullWidth
            value={board.visibility}
            onChange={(e) => visibilityMutation.mutate({
              visibility: e.target.value as BoardVisibility,
              allowAnonymousEditing: board.sharedAllowAnonymousEditing,
            })}
          >
            <MenuItem value={BoardVisibility.Private}>{t('sharing.private')}</MenuItem>
            <MenuItem value={BoardVisibility.Public}>{t('sharing.public')}</MenuItem>
            <MenuItem value={BoardVisibility.Shared}>{t('sharing.shared')}</MenuItem>
          </Select>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={board.sharedAllowAnonymousEditing}
                disabled={board.visibility !== BoardVisibility.Shared}
                onChange={(e) => visibilityMutation.mutate({
                  visibility: board.visibility,
                  allowAnonymousEditing: e.target.checked,
                })}
              />
            }
            label={t('sharing.allowEditing')}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Share link */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('sharing.shareLink')}
          </Typography>
          {shareLink ? (
            <TextField
              size="small"
              fullWidth
              value={shareLink}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={copied ? t('sharing.copied') : t('sharing.copyLink')}>
                      <IconButton size="small" onClick={handleCopy}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          ) : (
            <Button variant="outlined" onClick={() => shareTokenMutation.mutate()}>
              {t('sharing.shareLink')}
            </Button>
          )}
          {copied && (
            <Alert severity="success" sx={{ mt: 1 }}>
              {t('sharing.copied')}
            </Alert>
          )}
        </Box>

        {/* Password */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('sharing.password')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              type="password"
              placeholder={t('sharing.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={() => {
                passwordMutation.mutate(password || null);
                setPassword('');
              }}
            >
              {password ? t('sharing.setPassword') : t('sharing.removePassword')}
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Members */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('sharing.members')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              placeholder="User ID"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={() => addMemberMutation.mutate(newMember)}
              disabled={!newMember}
            >
              {t('sharing.addMember')}
            </Button>
          </Box>
          <List dense>
            {(board.members ?? []).map((m) => (
              <ListItem key={m.userId}>
                <ListItemText primary={m.username || m.userId} />
                <Select
                  size="small"
                  value={m.role}
                  onChange={(e) =>
                    updateRoleMutation.mutate({ userId: m.userId, role: e.target.value as BoardRole })
                  }
                  sx={{ mr: 1, minWidth: 100 }}
                >
                  <MenuItem value={BoardRole.Owner}>{t('sharing.owner')}</MenuItem>
                  <MenuItem value={BoardRole.Editor}>{t('sharing.editor')}</MenuItem>
                  <MenuItem value={BoardRole.Viewer}>{t('sharing.viewer')}</MenuItem>
                </Select>
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => removeMemberMutation.mutate(m.userId)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
