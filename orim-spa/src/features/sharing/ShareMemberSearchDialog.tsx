import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import type { AxiosError } from 'axios';
import { searchShareableUsers } from '../../api/boards';
import type { User } from '../../types/models';

interface ShareMemberSearchDialogProps {
  boardId: string;
  excludedUserIds: string[];
  open: boolean;
  onClose: () => void;
  onSelect: (user: User) => void;
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

export function ShareMemberSearchDialog({
  boardId,
  excludedUserIds,
  open,
  onClose,
  onSelect,
}: ShareMemberSearchDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const shareableUsersQuery = useQuery({
    queryKey: ['shareable-users', boardId, query],
    queryFn: () => searchShareableUsers(boardId, query.trim()),
    enabled: open,
  });

  const users = useMemo(
    () => (shareableUsersQuery.data ?? []).filter((user) => !excludedUserIds.includes(user.id)),
    [excludedUserIds, shareableUsersQuery.data],
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sharing.searchUsers')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          margin="dense"
          label={t('sharing.searchUsers')}
          placeholder={t('sharing.searchUsersPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {shareableUsersQuery.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(shareableUsersQuery.error, t('sharing.searchUsersFailed'))}
          </Alert>
        )}

        {shareableUsersQuery.isLoading ? (
          <Typography sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={18} />
            {t('sharing.searchUsersLoading')}
          </Typography>
        ) : (
          <List dense sx={{ mt: 2, maxHeight: 320, overflowY: 'auto' }}>
            {users.map((user) => (
              <ListItemButton key={user.id} onClick={() => onSelect(user)}>
                <ListItemText primary={user.username} secondary={user.role} />
              </ListItemButton>
            ))}
          </List>
        )}

        {!shareableUsersQuery.isLoading && !shareableUsersQuery.isError && users.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {query.trim()
              ? t('sharing.searchUsersNoResults')
              : t('sharing.searchUsersEmpty')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}