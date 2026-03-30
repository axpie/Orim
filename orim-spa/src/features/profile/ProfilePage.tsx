import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import SaveIcon from '@mui/icons-material/Save';
import { changePassword, getUser, updateProfile } from '../../api/users';
import { useAuthStore } from '../../stores/authStore';
import { getApiErrorMessage } from '../../utils/apiErrors';

type MessageState = {
  severity: 'success' | 'error';
  text: string;
} | null;

export function ProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [message, setMessage] = useState<MessageState>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const userId = currentUser?.id ?? '';
  const profileQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: userId.length > 0,
  });

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName);
    }
  }, [profileQuery.data]);

  const profileMutation = useMutation({
    mutationFn: (value: string) => updateProfile(userId, { displayName: value }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['user', userId], updatedUser);

      if (currentUser) {
        setUser({
          ...currentUser,
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          role: updatedUser.role,
        });
      }

      setDisplayName(updatedUser.displayName);
      setMessage({ severity: 'success', text: t('profile.profileUpdated') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('profile.profileUpdateFailed')) });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(userId, newPassword, currentPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ severity: 'success', text: t('profile.passwordChanged') });
    },
    onError: (error) => {
      setMessage({ severity: 'error', text: getApiErrorMessage(error, t('profile.passwordChangeFailed')) });
    },
  });

  if (!currentUser) {
    return null;
  }

  const isPasswordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isPasswordValid =
    currentPassword.length > 0
    && newPassword.length > 0
    && confirmPassword.length > 0
    && !isPasswordMismatch;
  const currentDisplayName = profileQuery.data?.displayName ?? currentUser.displayName;
  const normalizedDisplayName = displayName.trim();
  const canSaveProfile =
    normalizedDisplayName.length > 0
    && normalizedDisplayName !== currentDisplayName
    && !profileMutation.isPending;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          {t('profile.title')}
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.severity} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      {profileQuery.isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getApiErrorMessage(profileQuery.error, t('profile.loadFailed'))}
        </Alert>
      )}

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('profile.accountDetails')}
            </Typography>

            {profileQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Stack spacing={2.5}>
                <TextField
                  label={t('profile.displayName')}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  fullWidth
                  disabled={profileMutation.isPending}
                  helperText={t('profile.displayNameHint')}
                />

                <TextField
                  label={t('auth.username')}
                  value={profileQuery.data?.username ?? currentUser.username}
                  fullWidth
                  disabled
                  helperText={t('profile.usernameManagedByAdmin')}
                />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => profileMutation.mutate(normalizedDisplayName)}
                    disabled={!canSaveProfile}
                  >
                    {t('profile.saveProfile')}
                  </Button>
                </Box>
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('profile.security')}
            </Typography>

            <Stack spacing={2.5}>
              <TextField
                label={t('profile.currentPassword')}
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                fullWidth
                disabled={passwordMutation.isPending}
              />

              <TextField
                label={t('profile.newPassword')}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                fullWidth
                disabled={passwordMutation.isPending}
              />

              <TextField
                label={t('profile.confirmPassword')}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                fullWidth
                error={isPasswordMismatch}
                helperText={isPasswordMismatch ? t('profile.passwordMismatch') : ' '}
                disabled={passwordMutation.isPending}
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  startIcon={<LockResetIcon />}
                  onClick={() => passwordMutation.mutate()}
                  disabled={!isPasswordValid || passwordMutation.isPending}
                >
                  {t('profile.updatePassword')}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
