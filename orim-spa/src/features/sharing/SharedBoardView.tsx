import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Drawer,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Stack,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { getSharedBoard, replaceSharedBoardContent, validateSharePassword } from '../../api/boards';
import { useBoardStore } from '../whiteboard/store/boardStore';
import { useCommandStack } from '../whiteboard/store/commandStack';
import { WhiteboardCanvas } from '../whiteboard/canvas/WhiteboardCanvas';
import { Toolbar } from '../whiteboard/tools/Toolbar';
import { BoardTopBar } from '../whiteboard/tools/BoardTopBar';
import { PropertiesPanel } from '../whiteboard/panels/PropertiesPanel';
import { deriveBoardSyncStatus } from '../whiteboard/boardSyncStatus';
import { useSignalR } from '../../hooks/useSignalR';
import { useAuthStore } from '../../stores/authStore';
import type { Board } from '../../types/models';
import { resolveInitialGuestDisplayName } from './guestDisplayNames';

const guestNameStorageKey = 'orim_guest_name';
const PROPERTIES_PANEL_WIDTH = 280;

function isProtectedBoardResponse(value: unknown): value is { requiresPassword: boolean; boardId: string; title: string } {
  return !!value && typeof value === 'object' && 'requiresPassword' in value;
}

export function SharedBoardView() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isNarrowPanelMode = useMediaQuery(theme.breakpoints.down('sm'));
  const isMediumDown = useMediaQuery(theme.breakpoints.down('md'));
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');
  const isCompactToolbarLayout = isMediumDown || isCoarsePointer;
  const setBoard = useBoardStore((s) => s.setBoard);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const setViewportInsets = useBoardStore((s) => s.setViewportInsets);
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
  const activeSavePromiseRef = useRef<Promise<Board | null> | null>(null);
  const compactOverlayOpen = isCompactToolbarLayout && propertiesOpen;

  const { isLoading, isError } = useQuery({
    queryKey: ['shared-board', token],
    queryFn: async () => {
      const data = await getSharedBoard(token!);
      if (isProtectedBoardResponse(data)) {
        setNeedsPassword(true);
        setBoard(null, { preserveSelection: false, resetTool: true });
        setRemoteCursors([]);
        clearCommandStack();
        return null;
      }

      setNeedsPassword(false);
      setBoard(data, { preserveSelection: false });
      setRemoteCursors([]);
      clearCommandStack();
      return data;
    },
    enabled: !!token,
  });

  const {
    sendBoardState,
    sendBoardStateThrottled,
    sendCursorUpdate,
    updateDisplayName,
    connectionId,
    connectionState,
    lastError,
  } = useSignalR({
    boardId: board?.id ?? null,
    shareToken: token ?? null,
    sharePassword: validatedPassword,
    displayName: guestDisplayName,
    onBoardStateUpdated: (notification) => {
      setBoard(notification.board);
      clearCommandStack();
      if (token) {
        queryClient.setQueryData(['shared-board', token], notification.board);
      }
    },
    onPresenceUpdated: (cursors) => setRemoteCursors(cursors),
    onCursorUpdated: (cursor) => {
      const current = useBoardStore.getState().remoteCursors.filter((entry) => entry.clientId !== cursor.clientId);
      setRemoteCursors([...current, cursor]);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (currentBoard: Board) => replaceSharedBoardContent(token!, currentBoard, validatedPassword, connectionId),
  });

  const clearScheduledSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistCurrentBoard = useCallback(async (): Promise<Board | null> => {
    if (activeSavePromiseRef.current) {
      try {
        await activeSavePromiseRef.current;
      } catch {
        // Keep the latest mutation error in React Query state.
      }

      if (!useBoardStore.getState().isDirty) {
        return useBoardStore.getState().board;
      }
    }

    const current = useBoardStore.getState().board;
    if (!current?.sharedAllowAnonymousEditing || !token) {
      return null;
    }

    const savePromise = saveMutation.mutateAsync(current).then((nextBoard) => {
      setBoard(nextBoard, { preserveSelection: true });
      setDirty(false);
      queryClient.setQueryData(['shared-board', token], nextBoard);
      return nextBoard;
    });

    activeSavePromiseRef.current = savePromise;

    try {
      return await savePromise;
    } finally {
      if (activeSavePromiseRef.current === savePromise) {
        activeSavePromiseRef.current = null;
      }
    }
  }, [queryClient, saveMutation, setBoard, setDirty, token]);

  const scheduleSave = useCallback(() => {
    clearScheduledSave();
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistCurrentBoard();
    }, 1200);
  }, [clearScheduledSave, persistCurrentBoard]);

  const boardSyncStatus = useMemo(() => deriveBoardSyncStatus({
    connectionState,
    lastError,
    isDirty,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
  }), [connectionState, isDirty, lastError, saveMutation.error, saveMutation.isPending]);

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

  useEffect(() => {
    if (!board?.sharedAllowAnonymousEditing || isNarrowPanelMode) {
      setViewportInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }

    setViewportInsets({
      top: 0,
      right: propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0,
      bottom: 0,
      left: 0,
    });
  }, [board?.sharedAllowAnonymousEditing, isNarrowPanelMode, propertiesOpen, setViewportInsets]);

  useEffect(() => {
    if (!board?.sharedAllowAnonymousEditing || !isDirty) {
      return;
    }

    scheduleSave();
  }, [board?.elements, board?.sharedAllowAnonymousEditing, board?.title, isDirty, scheduleSave]);

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  const handlePasswordSubmit = async () => {
    try {
      const result = await validateSharePassword(token!, password);
      setBoard(result, { preserveSelection: false });
      clearCommandStack();
      setNeedsPassword(false);
      setValidatedPassword(password);
      setPasswordError(false);
      queryClient.setQueryData(['shared-board', token], result);
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (needsPassword) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
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
            <Button variant="contained" fullWidth onClick={() => { void handlePasswordSubmit(); }}>
              {t('common.confirm')}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (isError || !board) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
        <Typography>Board not found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' }}>
      <BoardTopBar
        onOpenProperties={() => setPropertiesOpen((current) => !current)}
        onOpenChat={() => {}}
        propertiesOpen={propertiesOpen}
        chatOpen={false}
        syncStatus={boardSyncStatus}
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
        {board.sharedAllowAnonymousEditing && !compactOverlayOpen && <Toolbar />}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <WhiteboardCanvas
            editable={board.sharedAllowAnonymousEditing}
            localPresenceClientId={connectionId}
            onBoardChanged={onBoardChanged}
            onBoardLiveChanged={onBoardLiveChanged}
            onPointerPresenceChanged={sendCursorUpdate}
          />

          {board.sharedAllowAnonymousEditing && !isNarrowPanelMode && propertiesOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: PROPERTIES_PANEL_WIDTH,
                zIndex: 5,
                boxShadow: 6,
              }}
            >
              <PropertiesPanel onClose={() => setPropertiesOpen(false)} onBoardChanged={onBoardChanged} />
            </Box>
          )}
        </Box>
      </Box>

      {board.sharedAllowAnonymousEditing && isNarrowPanelMode && (
        <Drawer
          anchor="right"
          open={propertiesOpen}
          onClose={() => setPropertiesOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: '100vw',
              maxWidth: '100vw',
            },
          }}
        >
          <PropertiesPanel mobile onClose={() => setPropertiesOpen(false)} onBoardChanged={onBoardChanged} />
        </Drawer>
      )}
    </Box>
  );
}
