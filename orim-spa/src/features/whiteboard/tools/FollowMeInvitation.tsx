import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Box,
  Button,
  Paper,
  Snackbar,
  Typography,
} from '@mui/material';
import CastIcon from '@mui/icons-material/Cast';

interface FollowMeInvitationProps {
  presenterClientId: string | null;
  presenterDisplayName: string | null;
  presenterColorHex?: string | null;
  onAccept: (clientId: string) => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

export function FollowMeInvitation({
  presenterClientId,
  presenterDisplayName,
  presenterColorHex,
  onAccept,
  onDismiss,
}: FollowMeInvitationProps) {
  const { t } = useTranslation();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!presenterClientId) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [presenterClientId, onDismiss]);

  const handleAccept = () => {
    if (presenterClientId) {
      onAccept(presenterClientId);
    }
  };

  return (
    <Snackbar
      open={!!presenterClientId}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Paper elevation={4} sx={{ p: 1.5, minWidth: 280, maxWidth: 360 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              fontSize: 14,
              bgcolor: presenterColorHex ?? 'primary.main',
              flexShrink: 0,
            }}
          >
            {presenterDisplayName?.charAt(0).toUpperCase() ?? <CastIcon fontSize="small" />}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {presenterDisplayName ?? t('board.followMe.presenter', 'Ein Teilnehmer')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('board.followMe.inviteText', 'startet eine Präsentation')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" variant="text" onClick={onDismiss}>
            {t('board.followMe.ignore', 'Ignorieren')}
          </Button>
          <Button size="small" variant="contained" onClick={handleAccept}>
            {t('board.followMe.follow', 'Folgen')}
          </Button>
        </Box>
      </Paper>
    </Snackbar>
  );
}
