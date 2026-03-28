import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import BlockIcon from '@mui/icons-material/Block';
import {
  getUsers,
  createUser,
  changePassword,
  deactivateUser,
  deleteUser,
} from '../../api/users';
import { UserRole, type User } from '../../types/models';

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      changePassword(id, password),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.User);

  // Change password dialog
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUserId, setPwUserId] = useState('');
  const [pwValue, setPwValue] = useState('');

  const handleCreate = () => {
    createMutation.mutate({
      username: newUsername,
      password: newPassword,
      role: newRole,
    });
    setCreateOpen(false);
    setNewUsername('');
    setNewPassword('');
    setNewRole(UserRole.User);
  };

  const handleChangePassword = () => {
    passwordMutation.mutate({ id: pwUserId, password: pwValue });
    setPwOpen(false);
    setPwValue('');
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('admin.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          {t('admin.userManagement')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          {t('admin.createUser')}
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('auth.username')}</TableCell>
              <TableCell>{t('admin.role')}</TableCell>
              <TableCell>{t('admin.status')}</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user: User) => (
              <TableRow key={user.id}>
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
                  <Tooltip title={t('admin.changePassword')}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setPwUserId(user.id);
                        setPwOpen(true);
                      }}
                    >
                      <LockResetIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('admin.deactivate')}>
                    <IconButton
                      size="small"
                      onClick={() => deactivateMutation.mutate(user.id)}
                    >
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('admin.deleteUser')}>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(user.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.createUser')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('auth.username')}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            fullWidth
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Select
            fullWidth
            size="small"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
          >
            <MenuItem value={UserRole.User}>User</MenuItem>
            <MenuItem value={UserRole.Admin}>Admin</MenuItem>
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newUsername || !newPassword}>
            {t('admin.createUser')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.changePassword')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('admin.newPassword')}
            type="password"
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleChangePassword} disabled={!pwValue}>
            {t('admin.changePassword')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
