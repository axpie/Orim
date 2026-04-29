import { useState, type FormEventHandler } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  SvgIcon,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { mdiMicrosoft } from '@mdi/js';
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { OrimLogoAnimation } from '../../components/Brand/OrimLogoAnimation';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useAuthStore } from '../../stores/authStore';
import { getAuthProviders } from '../../api/auth';
import { signInWithMicrosoft } from './microsoftAuth';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginWithMicrosoft = useAuthStore((s) => s.loginWithMicrosoft);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  const { data: providers } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: getAuthProviders,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const microsoftProvider = providers?.microsoft ?? null;
  const googleProvider = providers?.google ?? null;
  const hasExternalProviders = !!(microsoftProvider || googleProvider);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    if (!microsoftProvider) return;

    setError('');
    setMicrosoftLoading(true);
    try {
      const idToken = await signInWithMicrosoft(microsoftProvider);
      await loginWithMicrosoft(idToken);
      navigate('/');
    } catch {
      setError(t('auth.microsoftLoginError'));
    } finally {
      setMicrosoftLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError(t('auth.googleLoginError'));
      return;
    }
    try {
      await loginWithGoogle(credentialResponse.credential);
      navigate('/');
    } catch {
      setError(t('auth.googleLoginError'));
    }
  };

  const handleGoogleError = () => {
    setError(t('auth.googleLoginError'));
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: 400, maxWidth: '90vw' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <OrimLogoAnimation subtitle={t('auth.welcome')} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <LanguageSwitcher />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {microsoftProvider && (
            <Button
              type="button"
              variant="outlined"
              fullWidth
              size="large"
              disabled={loading || microsoftLoading}
              onClick={handleMicrosoftSignIn}
              startIcon={microsoftLoading ? undefined : (
                <SvgIcon fontSize="small">
                  <path d={mdiMicrosoft} />
                </SvgIcon>
              )}
              sx={{ mb: 2 }}
            >
              {microsoftLoading ? <CircularProgress size={24} /> : t('auth.loginWithMicrosoft')}
            </Button>
          )}

          {googleProvider && (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
              <GoogleOAuthProvider clientId={googleProvider.clientId}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  width="352"
                />
              </GoogleOAuthProvider>
            </Box>
          )}

          {hasExternalProviders && (
            <Divider sx={{ mb: 2 }}>{t('auth.orContinueWithPassword')}</Divider>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              required
              autoFocus={!hasExternalProviders}
              sx={{ mb: 2 }}
            />
            <TextField
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || microsoftLoading}
            >
              {loading ? <CircularProgress size={24} /> : t('auth.loginButton')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
