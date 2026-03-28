import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Stack,
} from '@mui/material';
import { getSharedBoard, replaceSharedBoardContent, validateSharePassword } from '../../api/boards';
import { useBoardStore } from '../whiteboard/store/boardStore';
import { useCommandStack } from '../whiteboard/store/commandStack';
import { WhiteboardCanvas } from '../whiteboard/canvas/WhiteboardCanvas';
import { Toolbar } from '../whiteboard/tools/Toolbar';
import { BoardTopBar } from '../whiteboard/tools/BoardTopBar';
import { PropertiesPanel } from '../whiteboard/panels/PropertiesPanel';
import { useSignalR } from '../../hooks/useSignalR';
import { useAuthStore } from '../../stores/authStore';
import type { Board } from '../../types/models';
import { resolveInitialGuestDisplayName } from './guestDisplayNames';

const guestNameStorageKey = 'orim_guest_name';

function isProtectedBoardResponse(value: unknown): value is { requiresPassword: boolean; boardId: string; title: string } {
  return !!value && typeof value === 'object' && 'requiresPassword' in value;
}

export function SharedBoardView() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const setBoard = useBoardStore((s) => s.setBoard);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const clearCommandStack = useCommandStack((s) => s.clear);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [password, setPassword] = useState('');
  const [validatedPassword, setValidatedPassword] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [guestDisplayName, setGuestDisplayName] = useState(() => {
    const storedName = window.localStorage.getItem(guestNameStorageKey);
    const initialName = resolveInitialGuestDisplayName(i18n.resolvedLanguage, storedName);
    window.localStorage.setItem(guestNameStorageKey, initialName);
    return initialName;
  });
  const [guestNameDraft, setGuestNameDraft] = useState(guestDisplayName);
  const [guestNameSaved, setGuestNameSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isLoading, isError } = useQuery({
    queryKey: ['shared-board', token],
    queryFn: async () => {
      const data = await getSharedBoard(token!);
      if (isProtectedBoardResponse(data)) {
        setNeedsPassword(true);
        return null;
      }

      setBoard(data);
      setRemoteCursors([]);
      clearCommandStack();
      return data;
    },
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: (currentBoard: Board) => replaceSharedBoardContent(token!, currentBoard, validatedPassword, connectionId),
    onSuccess: (nextBoard) => {
      setBoard(nextBoard);
      setDirty(false);
    },
  });

  const { sendBoardState, sendBoardStateThrottled, sendCursorUpdate, updateDisplayName, connectionId } = useSignalR({
    boardId: board?.id ?? null,
    shareToken: token ?? null,
    sharePassword: validatedPassword,
    displayName: guestDisplayName,
    onBoardStateUpdated: (notification) => {
      setBoard(notification.board);
      clearCommandStack();
    },
    onPresenceUpdated: (cursors) => setRemoteCursors(cursors),
    onCursorUpdated: (cursor) => {
      const current = useBoardStore.getState().remoteCursors.filter((entry) => entry.clientId !== cursor.clientId);
      setRemoteCursors([...current, cursor]);
    },
  });

  useEffect(() => {
    setGuestNameDraft(guestDisplayName);
  }, [guestDisplayName]);

  useEffect(() => {
    if (!guestNameSaved) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setGuestNameSaved(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [guestNameSaved]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = useBoardStore.getState().board;
      if (current && current.sharedAllowAnonymousEditing) {
        saveMutation.mutate(current);
      }
    }, 1200);
  }, [saveMutation]);

  useEffect(() => {
    if (isDirty && board?.sharedAllowAnonymousEditing) {
      scheduleSave();
    }

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [board?.sharedAllowAnonymousEditing, isDirty, scheduleSave]);

  const handlePasswordSubmit = async () => {
    try {
      const result = await validateSharePassword(token!, password);
      setBoard(result);
      clearCommandStack();
      setNeedsPassword(false);
      setValidatedPassword(password);
    } catch {
      setPasswordError(true);
    }
  };

  const onBoardChanged = useCallback((changeKind: string) => {
    setDirty(true);
    const current = useBoardStore.getState().board;
    if (current && current.sharedAllowAnonymousEditing) {
      sendBoardState(current, changeKind);
    }
  }, [sendBoardState, setDirty]);

  const onBoardLiveChanged = useCallback((changeKind: string) => {
    const current = useBoardStore.getState().board;
    if (current && current.sharedAllowAnonymousEditing) {
      sendBoardStateThrottled(current, changeKind);
    }
  }, [sendBoardStateThrottled]);

  const handleGuestNameSave = useCallback(() => {
    const trimmedName = guestNameDraft.trim();
    if (!trimmedName || trimmedName === guestDisplayName) {
      setGuestNameDraft(trimmedName || guestDisplayName);
      return;
    }

    window.localStorage.setItem(guestNameStorageKey, trimmedName);
    setGuestDisplayName(trimmedName);
    updateDisplayName(trimmedName);
    setGuestNameSaved(true);
  }, [guestDisplayName, guestNameDraft, updateDisplayName]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (needsPassword) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Card sx={{ width: 400, maxWidth: '90vw' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('sharing.password')}
            </Typography>
            <TextField
              type="password"
              label={t('sharing.password')}
              fullWidth
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(false);
              }}
              error={passwordError}
              helperText={passwordError ? t('sharing.invalidPassword') : ''}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" fullWidth onClick={handlePasswordSubmit}>
              {t('common.confirm')}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (isError || !board) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography>Board not found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BoardTopBar
        onOpenProperties={() => setPropertiesOpen(true)}
        onOpenChat={() => {}}
        propertiesOpen={propertiesOpen}
        chatOpen={false}
        saving={saveMutation.isPending}
        titleEditable={false}
        showShare={false}
        showExport={false}
        showChat={false}
        showProperties={board.sharedAllowAnonymousEditing}
        showBackButton={false}
        collaborators={remoteCursors}
        localConnectionId={connectionId}
      />
      {!isAuthenticated && (
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              size="small"
              label={t('sharing.guestDisplayName')}
              placeholder={t('sharing.guestDisplayNamePlaceholder')}
              value={guestNameDraft}
              onChange={(event) => setGuestNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleGuestNameSave();
                }
              }}
              sx={{ minWidth: { sm: 280 } }}
            />
            <Button
              variant="outlined"
              onClick={handleGuestNameSave}
              disabled={!guestNameDraft.trim() || guestNameDraft.trim() === guestDisplayName}
            >
              {t('sharing.saveGuestDisplayName')}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {t('sharing.guestDisplayNameHint')}
            </Typography>
          </Stack>
          {guestNameSaved && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              {t('sharing.guestDisplayNameSaved')}
            </Alert>
          )}
        </Box>
      )}
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {board.sharedAllowAnonymousEditing && <Toolbar />}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <WhiteboardCanvas
            editable={board.sharedAllowAnonymousEditing}
            localPresenceClientId={connectionId}
            onBoardChanged={onBoardChanged}
            onBoardLiveChanged={onBoardLiveChanged}
            onPointerPresenceChanged={sendCursorUpdate}
          />

          {board.sharedAllowAnonymousEditing && propertiesOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: 280,
                zIndex: 5,
                boxShadow: 6,
              }}
            >
              <PropertiesPanel onClose={() => setPropertiesOpen(false)} onBoardChanged={onBoardChanged} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
