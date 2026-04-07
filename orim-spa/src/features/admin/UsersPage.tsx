import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import {
  activateUser,
  changePassword,
  createUser,
  deactivateUser,
  deleteUser,
  getUsers,
  updateUser,
} from '../../api/users';
import { refreshToken } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import { UserRole, type User } from '../../types/models';
import { getApiErrorMessage } from '../../utils/apiErrors';

type MessageState = {
  severity: 'success' | 'error';
  text: string;
} | null;

const roleOptions = [UserRole.User, UserRole.Admin];

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const currentUserId = currentUser?.id ?? '';

  const [message, setMessage] = useState<MessageState>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.User);

  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.User);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState('');
  const [passwordValue, setPasswordValue] = useState('');

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const syncCurrentSessionIfNeeded = async (updatedUser: User) => {
    if (updatedUser.id !== currentUserId) {
      return;
    }

    const refreshedSession = await refreshToken();
    setSession(refreshedSession);
  };

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      await invalidateUsers();
      setCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole(UserRole.User);
      setMessage({ severity: 'success', text: t('admin.userCreated') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.createFailed')) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, username, role }: { id: string; username: string; role: UserRole }) =>
      updateUser(id, { username, role }),
    onSuccess: async (updatedUser) => {
      await invalidateUsers();
      await syncCurrentSessionIfNeeded(updatedUser);
      setEditOpen(false);
      setEditUserId('');
      setEditUsername('');
      setEditRole(UserRole.User);
      setMessage({ severity: 'success', text: t('admin.userUpdated') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.updateFailed')) });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => changePassword(id, password),
    onSuccess: () => {
      setPasswordOpen(false);
      setPasswordUserId('');
      setPasswordValue('');
      setMessage({ severity: 'success', text: t('admin.passwordChangedSuccess') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.passwordChangeFailed')) });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: async () => {
      await invalidateUsers();
      setMessage({ severity: 'success', text: t('admin.userDeactivated') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.deactivateFailed')) });
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateUser,
    onSuccess: async () => {
      await invalidateUsers();
      setMessage({ severity: 'success', text: t('admin.userActivated') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.activateFailed')) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: async () => {
      await invalidateUsers();
      setMessage({ severity: 'success', text: t('admin.userDeleted') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('admin.deleteFailed')) });
    },
  });

  const users = usersQuery.data ?? [];
  const editingUser = users.find((user) => user.id === editUserId) ?? null;
  const passwordUser = users.find((user) => user.id === passwordUserId) ?? null;

  const handleCreate = () => {
    createMutation.mutate({
      username: newUsername,
      password: newPassword,
      role: newRole,
    });
  };

  const handleUpdate = () => {
    updateMutation.mutate({
      id: editUserId,
      username: editUsername,
      role: editRole,
    });
  };

  const handlePasswordChange = () => {
    passwordMutation.mutate({
      id: passwordUserId,
      password: passwordValue,
    });
  };

  const handleDelete = (user: User) => {
    if (window.confirm(t('admin.deleteConfirm', { name: user.displayName }))) {
      deleteMutation.mutate(user.id);
    }
  };

  const openEditDialog = (user: User) => {
    setEditUserId(user.id);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditOpen(true);
  };

  const openPasswordDialog = (user: User) => {
    setPasswordUserId(user.id);
    setPasswordValue('');
    setPasswordOpen(true);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          {t('admin.userManagement')}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          {t('admin.createUser')}
        </Button>
      </Box>

      {message && (
        <Alert severity={message.severity} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      {usersQuery.isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getApiErrorMessage(usersQuery.error, t('admin.loadFailed'))}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('admin.displayName')}</TableCell>
              <TableCell>{t('auth.username')}</TableCell>
              <TableCell>{t('admin.role')}</TableCell>
              <TableCell>{t('admin.status')}</TableCell>
              <TableCell align="right">{t('admin.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {usersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary">{t('admin.loadingUsers')}</Typography>
                </TableCell>
              </TableRow>
            )}

            {!usersQuery.isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary">{t('admin.noUsers')}</Typography>
                </TableCell>
              </TableRow>
            )}

            {users.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              const togglePending = deactivateMutation.isPending || activateMutation.isPending;
              const toggleDisabled = isCurrentUser || togglePending;
              const toggleTooltip = isCurrentUser
                ? t('admin.cannotDeactivateSelf')
                : user.isActive
                  ? t('admin.deactivate')
                  : t('admin.activate');

              return (
                <TableRow key={user.id}>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.role}
                      size="small"
                      color={user.role === UserRole.Admin ? 'error' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isActive ? t('admin.active') : t('admin.inactive')}
                      size="small"
                      color={user.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={t('admin.editUser')}>
                        <span>
                          <IconButton size="small" onClick={() => openEditDialog(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={t('admin.changePassword')}>
                        <span>
                          <IconButton size="small" onClick={() => openPasswordDialog(user)}>
                            <LockResetIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={toggleTooltip}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={toggleDisabled}
                            color={user.isActive ? 'default' : 'success'}
                            onClick={() => user.isActive
                              ? deactivateMutation.mutate(user.id)
                              : activateMutation.mutate(user.id)}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={t('admin.deleteUser')}>
                        <span>
                          <IconButton size="small" onClick={() => handleDelete(user)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.createUser')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('auth.username')}
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            fullWidth
            sx={{ mt: 1, mb: 2 }}
            disabled={createMutation.isPending}
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            disabled={createMutation.isPending}
          />
          <Select
            fullWidth
            size="small"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as UserRole)}
            disabled={createMutation.isPending}
          >
            {roleOptions.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!newUsername.trim() || !newPassword || createMutation.isPending}
          >
            {t('admin.createUser')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.editUser')}</DialogTitle>
        <DialogContent>
          {editingUser && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              {t('admin.displayName')}: {editingUser.displayName}
            </Typography>
          )}

          <TextField
            label={t('auth.username')}
            value={editUsername}
            onChange={(event) => setEditUsername(event.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            disabled={updateMutation.isPending}
          />
          <Select
            fullWidth
            size="small"
            value={editRole}
            onChange={(event) => setEditRole(event.target.value as UserRole)}
            disabled={updateMutation.isPending}
          >
            {roleOptions.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={!editUsername.trim() || !editUserId || updateMutation.isPending}
          >
            {t('admin.editUser')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={passwordOpen} onClose={() => setPasswordOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.changePassword')}</DialogTitle>
        <DialogContent>
          {passwordUser && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              @{passwordUser.username}
            </Typography>
          )}

          <TextField
            label={t('admin.newPassword')}
            type="password"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            fullWidth
            autoFocus
            disabled={passwordMutation.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handlePasswordChange}
            disabled={!passwordValue || passwordMutation.isPending}
          >
            {t('admin.changePassword')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
