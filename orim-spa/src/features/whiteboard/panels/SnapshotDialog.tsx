import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import type { BoardSnapshot } from '../../../types/models';

interface SnapshotDialogProps {
  open: boolean;
  snapshots: BoardSnapshot[];
  onClose: () => void;
  onCreateSnapshot: (name?: string) => Promise<void>;
  onRestoreSnapshot: (snapshotId: string) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: unknown };
      message?: string;
    };

    if (typeof candidate.response?.data === 'string' && candidate.response.data.trim().length > 0) {
      return candidate.response.data;
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return 'Snapshot request failed.';
}

export function SnapshotDialog({
  open,
  snapshots,
  onClose,
  onCreateSnapshot,
  onRestoreSnapshot,
}: SnapshotDialogProps) {
  const { t, i18n } = useTranslation();
  const [snapshotName, setSnapshotName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);
  const [pendingRestoreSnapshotId, setPendingRestoreSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSnapshotName('');
      setErrorMessage(null);
      setCreating(false);
      setRestoringSnapshotId(null);
      setPendingRestoreSnapshotId(null);
    }
  }, [open]);

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [snapshots],
  );

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.resolvedLanguage],
  );

  const handleCreate = async () => {
    setCreating(true);
    setErrorMessage(null);

    try {
      const trimmedName = snapshotName.trim();
      await onCreateSnapshot(trimmedName.length > 0 ? trimmedName : undefined);
      setSnapshotName('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    setRestoringSnapshotId(snapshotId);
    setPendingRestoreSnapshotId(null);
    setErrorMessage(null);

    try {
      await onRestoreSnapshot(snapshotId);
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRestoringSnapshotId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={creating || restoringSnapshotId ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('board.snapshots')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('board.snapshotDialogHint')}
          </Typography>

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label={t('board.snapshotName')}
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
              placeholder={t('board.snapshotUnnamed', { index: sortedSnapshots.length + 1 })}
              disabled={creating || restoringSnapshotId != null}
            />
            <Button
              variant="contained"
              onClick={() => {
                void handleCreate();
              }}
              disabled={creating || restoringSnapshotId != null}
              startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {t('board.createSnapshot')}
            </Button>
          </Stack>

          <Divider />

          {sortedSnapshots.length === 0 ? (
            <Box sx={{ py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('board.snapshotEmpty')}
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {sortedSnapshots.map((snapshot, index) => {
                const snapshotLabel = snapshot.name?.trim() || t('board.snapshotUnnamed', { index: index + 1 });
                const isRestoring = restoringSnapshotId === snapshot.id;

                return (
                  <ListItem
                    key={snapshot.id}
                    disableGutters
                    divider={index < sortedSnapshots.length - 1}
                    secondaryAction={(
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setPendingRestoreSnapshotId(snapshot.id);
                          }}
                          disabled={creating || restoringSnapshotId != null}
                          startIcon={isRestoring ? <CircularProgress size={16} color="inherit" /> : undefined}
                      >
                        {t('board.restoreSnapshot')}
                      </Button>
                    )}
                    sx={{ pr: 12 }}
                  >
                    <ListItemText
                      primary={snapshotLabel}
                      secondary={`${formatter.format(new Date(snapshot.createdAt))} · ${t('board.snapshotCreatedBy', {
                        name: snapshot.createdByUsername,
                      })}`}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Stack>
      </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={creating || restoringSnapshotId != null}>
            {t('sharing.close')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={pendingRestoreSnapshotId != null}
        onClose={() => {
          if (!restoringSnapshotId) {
            setPendingRestoreSnapshotId(null);
          }
        }}
      >
        <DialogTitle>{t('board.restoreSnapshot')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingRestoreSnapshotId
              ? t('board.snapshotRestoreDescription', {
                name: sortedSnapshots.find((snapshot) => snapshot.id === pendingRestoreSnapshotId)?.name
                  ?? t('board.snapshotUnnamed', { index: 1 }),
              })
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRestoreSnapshotId(null)} disabled={restoringSnapshotId != null}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pendingRestoreSnapshotId) {
                void handleRestore(pendingRestoreSnapshotId);
              }
            }}
            disabled={restoringSnapshotId != null}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
