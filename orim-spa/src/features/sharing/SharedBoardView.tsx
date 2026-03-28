import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import { getSharedBoard, replaceSharedBoardContent, validateSharePassword } from '../../api/boards';
import { useBoardStore } from '../whiteboard/store/boardStore';
import { useCommandStack } from '../whiteboard/store/commandStack';
import { WhiteboardCanvas } from '../whiteboard/canvas/WhiteboardCanvas';
import { Toolbar } from '../whiteboard/tools/Toolbar';
import { BoardTopBar } from '../whiteboard/tools/BoardTopBar';
import { PropertiesPanel } from '../whiteboard/panels/PropertiesPanel';
import { useSignalR } from '../../hooks/useSignalR';
import type { Board } from '../../types/models';

function isProtectedBoardResponse(value: unknown): value is { requiresPassword: boolean; boardId: string; title: string } {
  return !!value && typeof value === 'object' && 'requiresPassword' in value;
}

export function SharedBoardView() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const setBoard = useBoardStore((s) => s.setBoard);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const clearCommandStack = useCommandStack((s) => s.clear);

  const [password, setPassword] = useState('');
  const [validatedPassword, setValidatedPassword] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guestDisplayName = useMemo(() => {
    const existing = window.localStorage.getItem('orim_guest_name');
    if (existing) {
      return existing;
    }

    const generated = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
    window.localStorage.setItem('orim_guest_name', generated);
    return generated;
  }, []);

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

  const { sendBoardState, sendBoardStateThrottled, sendCursorUpdate, connectionId } = useSignalR({
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
              helperText={passwordError ? 'Invalid password' : ''}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" fullWidth onClick={handlePasswordSubmit}>
              OK
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
