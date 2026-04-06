import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Alert,
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
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Divider,
  InputAdornment,
  FormControlLabel,
  Switch,
} from '@mui/material';
import type { AxiosError } from 'axios';
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
import { BoardVisibility, BoardRole, type User } from '../../types/models';
import { ShareMemberSearchDialog } from './ShareMemberSearchDialog';

interface ShareDialogProps {
  boardId: string;
  onClose: () => void;
}

interface ShareMemberViewModel {
  userId: string;
  username: string;
  role: BoardRole;
  isOwner: boolean;
  canEditRole: boolean;
  canRemove: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string } | string>;
  const payload = axiosError.response?.data;

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

export function ShareDialog({ boardId, onClose }: ShareDialogProps) {
  const { t } = useTranslation();

  const { data: board, refetch } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => getBoard(boardId),
  });

  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState(BoardRole.Editor);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [message, setMessage] = useState<{ severity: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const visibilityMutation = useMutation({
    mutationFn: ({ visibility, allowAnonymousEditing }: { visibility: BoardVisibility; allowAnonymousEditing: boolean }) =>
      setVisibility(boardId, visibility, allowAnonymousEditing),
    onSuccess: () => refetch(),
  });

  const shareTokenMutation = useMutation({
    mutationFn: () => generateShareToken(boardId),
    onSuccess: () => refetch(),
  });

  const passwordMutation = useMutation({
    mutationFn: (pw: string | null) => setSharePassword(boardId, pw),
    onSuccess: () => refetch(),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ username, role }: { username: string; role: BoardRole }) => addMember(boardId, username, role),
    onSuccess: () => {
      setMemberSearchOpen(false);
      setMessage({ severity: 'success', text: t('sharing.memberAdded') });
      refetch();
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('sharing.memberAddFailed')) });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeMember(boardId, userId),
    onSuccess: () => refetch(),
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('sharing.memberRemoveFailed')) });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
      updateMemberRole(boardId, userId, role),
    onSuccess: () => refetch(),
    onError: (error) => {
      setMessage({ severity: 'error', text: getErrorMessage(error, t('sharing.memberRoleUpdateFailed')) });
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!board) return null;

  const shareLink = board.shareLinkToken ? `${window.location.origin}/shared/${board.shareLinkToken}` : '';

  const shareLinkAccessible = board.visibility === BoardVisibility.Public;
  const visibilityDescriptionKey =
    board.visibility === BoardVisibility.Private
      ? 'sharing.privateDescription'
      : board.visibility === BoardVisibility.Public
        ? 'sharing.publicDescription'
        : 'sharing.sharedDescription';

  const shareLinkStatus = shareLinkAccessible
    ? { severity: 'info' as const, text: t('sharing.shareLinkPublicHint') }
    : board.visibility === BoardVisibility.Private
      ? { severity: 'warning' as const, text: t('sharing.shareLinkPrivateHint') }
      : { severity: 'warning' as const, text: t('sharing.shareLinkSharedHint') };

  const members = board.members ?? [];
  const ownerMembership = members.find((member) => member.userId === board.ownerId);
  const memberViewModels: ShareMemberViewModel[] = [
    {
      userId: board.ownerId,
      username: ownerMembership?.username || board.ownerId,
      role: BoardRole.Owner,
      isOwner: true,
      canEditRole: false,
      canRemove: false,
    },
    ...members
      .filter((member) => member.userId !== board.ownerId)
      .map((member) => ({
        ...member,
        isOwner: false,
        canEditRole: true,
        canRemove: true,
      })),
  ];
  const shareableUserIds = memberViewModels.map((member) => member.userId);

  const handleSelectUser = (user: User) => {
    addMemberMutation.mutate({ username: user.username, role: newMemberRole });
  };

  const handleRoleChange = (member: ShareMemberViewModel, role: BoardRole) => {
    if (!member.canEditRole || role === BoardRole.Owner) {
      return;
    }

    updateRoleMutation.mutate({ userId: member.userId, role });
  };

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('board.share')}</DialogTitle>
        <DialogContent>
          {message && (
            <Alert severity={message.severity} sx={{ mb: 2 }}>
              {message.text}
            </Alert>
          )}

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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t(visibilityDescriptionKey)}
          </Typography>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={board.sharedAllowAnonymousEditing}
                disabled={board.visibility !== BoardVisibility.Public}
                onChange={(e) => visibilityMutation.mutate({
                  visibility: board.visibility,
                  allowAnonymousEditing: e.target.checked,
                })}
              />
            }
            label={t('sharing.allowEditing')}
          />
          <Typography variant="body2" color="text.secondary">
            {t('sharing.allowEditingHint')}
          </Typography>
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
          <Alert severity={shareLinkStatus.severity} sx={{ mt: 1 }}>
            {shareLinkStatus.text}
          </Alert>
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
              disabled={!shareLinkAccessible}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              disabled={!shareLinkAccessible}
              onClick={() => {
                passwordMutation.mutate(password || null);
                setPassword('');
              }}
            >
              {password ? t('sharing.setPassword') : t('sharing.removePassword')}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('sharing.passwordHint')}
          </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

        {/* Members */}
          <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('sharing.members')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Select
              size="small"
              value={newMemberRole}
              onChange={(event) => setNewMemberRole(event.target.value as BoardRole)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value={BoardRole.Editor}>{t('sharing.editor')}</MenuItem>
              <MenuItem value={BoardRole.Viewer}>{t('sharing.viewer')}</MenuItem>
            </Select>
            <Button
              variant="outlined"
              onClick={() => setMemberSearchOpen(true)}
            >
              {t('sharing.searchUsers')}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('sharing.sharedMembersHint')}
          </Typography>
          <List dense>
            {memberViewModels.map((member) => (
              <ListItem key={member.userId} sx={{ gap: 1 }}>
                <ListItemText
                  disableTypography
                  primary={(
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography>{member.username || member.userId}</Typography>
                      {member.isOwner && (
                        <Chip
                          size="small"
                          color="primary"
                          variant="outlined"
                          label={t('sharing.owner')}
                        />
                      )}
                    </Box>
                  )}
                />
                {member.canEditRole && (
                  <Select
                    size="small"
                    value={member.role}
                    onChange={(event) => handleRoleChange(member, event.target.value as BoardRole)}
                    sx={{ minWidth: 100 }}
                  >
                    {member.role === BoardRole.Owner && (
                      <MenuItem value={BoardRole.Owner} disabled>
                        {t('sharing.owner')}
                      </MenuItem>
                    )}
                    <MenuItem value={BoardRole.Editor}>{t('sharing.editor')}</MenuItem>
                    <MenuItem value={BoardRole.Viewer}>{t('sharing.viewer')}</MenuItem>
                  </Select>
                )}
                {member.canRemove && (
                  <IconButton
                    size="small"
                    onClick={() => removeMemberMutation.mutate(member.userId)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </ListItem>
            ))}
          </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('sharing.close')}</Button>
        </DialogActions>
      </Dialog>

      <ShareMemberSearchDialog
        boardId={boardId}
        excludedUserIds={shareableUserIds}
        open={memberSearchOpen}
        onClose={() => setMemberSearchOpen(false)}
        onSelect={handleSelectUser}
      />
    </>
  );
}
