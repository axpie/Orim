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
  Snackbar,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Stack,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { getSharedBoard, getSharedBoardHistory, replaceSharedBoardContent, validateSharePassword } from '../../api/boards';
import { useBoardComments } from '../whiteboard/comments/useBoardComments';
import { useBoardStore } from '../whiteboard/store/boardStore';
import { useCommandStack } from '../whiteboard/store/commandStack';
import { WhiteboardCanvas } from '../whiteboard/canvas/WhiteboardCanvas';
import { Toolbar } from '../whiteboard/tools/Toolbar';
import { BoardTopBar } from '../whiteboard/tools/BoardTopBar';
import { PropertiesPanel } from '../whiteboard/panels/PropertiesPanel';
import { CommentsPanel, COMMENTS_PANEL_WIDTH } from '../whiteboard/panels/CommentsPanel';
import { deriveBoardSyncStatus } from '../whiteboard/boardSyncStatus';
import { getBoardSyncAnnouncement } from '../whiteboard/a11yAnnouncements';
import { formatBoardCommandConflict } from '../whiteboard/realtime/localBoardCommands';
import { useOperationOutboxStore } from '../whiteboard/store/outboxStore';
import { useSignalR } from '../../hooks/useSignalR';
import { useAuthStore } from '../../stores/authStore';
import type { Board } from '../../types/models';
import { BoardRole } from '../../types/models';
import { resolveInitialGuestDisplayName } from './guestDisplayNames';
import type { BoardOperationPayload } from '../whiteboard/realtime/boardOperations';
import { primeBoardHistorySequence, recoverBoardAfterReconnect } from '../whiteboard/realtime/reconnectRecovery';

const guestNameStorageKey = 'orim_guest_name';
const PROPERTIES_PANEL_WIDTH = 280;
const EMPTY_COMMENTS: Board['comments'] = [];

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
  const applyRemoteOperation = useBoardStore((s) => s.applyRemoteOperation);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const selectedElementIds = useBoardStore((s) => s.selectedElementIds);
  const setViewportInsets = useBoardStore((s) => s.setViewportInsets);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const commandConflict = useBoardStore((s) => s.commandConflict);
  const clearCommandConflict = useBoardStore((s) => s.clearCommandConflict);
  const outboxCount = useOperationOutboxStore((s) => (board?.id ? s.countForBoard(board.id) : 0));
  const clearCommandStack = useCommandStack((s) => s.clear);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [password, setPassword] = useState('');
  const [validatedPassword, setValidatedPassword] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<{ x: number; y: number } | null>(null);
  const [commentPlacementMode, setCommentPlacementMode] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ id: number; text: string } | null>(null);
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
  const liveAnnouncementIdRef = useRef(0);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const lastSyncAnnouncementRef = useRef<string | null>(null);
  const compactOverlayOpen = isCompactToolbarLayout && (propertiesOpen || commentsOpen);
  const comments = board?.comments ?? EMPTY_COMMENTS;
  const currentMembership = user && board
    ? board.members.find((member) => member.userId === user.id) ?? (board.ownerId === user.id
      ? { userId: user.id, username: user.username, role: BoardRole.Owner }
      : null)
    : null;
  const canCreateComments = currentMembership != null && currentMembership.role !== BoardRole.Viewer;

  const announceLive = useCallback((text: string | null | undefined) => {
    const normalized = text?.trim();
    if (!normalized) {
      return;
    }

    liveAnnouncementIdRef.current += 1;
    setLiveAnnouncement({ id: liveAnnouncementIdRef.current, text: normalized });
  }, []);

  const {
    errorMessage: commentError,
    clearErrorMessage: clearCommentError,
    handleCommentUpserted,
    handleCommentDeleted,
    createCommentAt,
    createReply,
    removeBoardComment,
    removeBoardCommentReply,
    isCreatingComment,
    isCreatingReply,
    deletingCommentId,
    deletingReply,
  } = useBoardComments(board?.id ?? null);

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
    sendOperation,
    sendOperationThrottled,
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
    beforeOutboxFlush: async ({ boardId, isReconnect, lastKnownSequenceNumber, updateLastKnownSequenceNumber }) => {
      if (!token) {
        return;
      }

      const queuedOperationsCount = useOperationOutboxStore.getState().countForBoard(boardId);
      if (!isReconnect && queuedOperationsCount === 0) {
        if (lastKnownSequenceNumber != null) {
          return;
        }

        updateLastKnownSequenceNumber(await primeBoardHistorySequence((since, limit) => (
          getSharedBoardHistory(token, validatedPassword, since, limit)
        )));
        return;
      }

      const currentBoard = useBoardStore.getState().board;
      if (currentBoard?.id === boardId && useBoardStore.getState().isDirty && queuedOperationsCount === 0) {
        return;
      }

      const recovery = await recoverBoardAfterReconnect({
        boardId,
        currentBoard,
        lastKnownSequenceNumber,
        fetchBoard: async () => {
          if (validatedPassword) {
            return validateSharePassword(token, validatedPassword);
          }

          const sharedBoard = await getSharedBoard(token);
          if (isProtectedBoardResponse(sharedBoard)) {
            throw new Error('Shared board password is required.');
          }

          return sharedBoard;
        },
        fetchHistory: (since, limit) => getSharedBoardHistory(token, validatedPassword, since, limit),
      });

      setBoard(recovery.board, { preserveSelection: true });
      clearCommandStack();
      queryClient.setQueryData(['shared-board', token], recovery.board);
      updateLastKnownSequenceNumber(recovery.latestSequenceNumber);
    },
    onBoardOperationApplied: (notification) => {
      applyRemoteOperation(notification.operation);
      const nextBoard = useBoardStore.getState().board;
      if (token && nextBoard) {
        queryClient.setQueryData(['shared-board', token], nextBoard);
      }
    },
    onBoardStateUpdated: (notification) => {
      setBoard(notification.board);
      clearCommandStack();
      if (token) {
        queryClient.setQueryData(['shared-board', token], notification.board);
      }
    },
    onCommentUpserted: handleCommentUpserted,
    onCommentDeleted: handleCommentDeleted,
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
    outboxCount,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
  }), [connectionState, isDirty, lastError, outboxCount, saveMutation.error, saveMutation.isPending]);

  useEffect(() => {
    const nextAnnouncement = getBoardSyncAnnouncement(boardSyncStatus, t);
    if (lastSyncAnnouncementRef.current == null) {
      lastSyncAnnouncementRef.current = nextAnnouncement;
      return;
    }

    if (nextAnnouncement !== lastSyncAnnouncementRef.current) {
      lastSyncAnnouncementRef.current = nextAnnouncement;
      announceLive(nextAnnouncement);
    }
  }, [announceLive, boardSyncStatus, t]);

  useEffect(() => {
    if (commandConflict) {
      announceLive(formatBoardCommandConflict(commandConflict));
    }
  }, [announceLive, commandConflict]);

  useEffect(() => {
    if (commentError) {
      announceLive(commentError);
    }
  }, [announceLive, commentError]);

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
      right: (commentsOpen ? COMMENTS_PANEL_WIDTH : 0) + (propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0),
      bottom: 0,
      left: 0,
    });
  }, [board?.sharedAllowAnonymousEditing, commentsOpen, isNarrowPanelMode, propertiesOpen, setViewportInsets]);

  useEffect(() => {
    if (activeCommentId && !comments.some((comment) => comment.id === activeCommentId)) {
      setActiveCommentId(null);
    }
  }, [activeCommentId, comments]);

  useEffect(() => {
    if (!board?.sharedAllowAnonymousEditing || !isDirty) {
      return;
    }

    scheduleSave();
  }, [board?.elements, board?.sharedAllowAnonymousEditing, board?.title, isDirty, scheduleSave]);

  useEffect(() => {
    if (connectionState === 'connected' && board?.sharedAllowAnonymousEditing && isDirty) {
      scheduleSave();
    }
  }, [board?.sharedAllowAnonymousEditing, connectionState, isDirty, scheduleSave]);

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  // Broadcast selected element IDs to remote collaborators (including anonymous users)
  useEffect(() => {
    if (connectionState === 'connected') {
      sendCursorUpdate(null, null, selectedElementIds.length > 0 ? selectedElementIds : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, connectionState]);

  const handlePointerPresenceChanged = useCallback(
    (worldX: number | null, worldY: number | null) => {
      const currentSelection = useBoardStore.getState().selectedElementIds;
      sendCursorUpdate(worldX, worldY, currentSelection.length > 0 ? currentSelection : undefined);
    },
    [sendCursorUpdate],
  );

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

  const onBoardChanged = useCallback((changeKind: string, operation?: BoardOperationPayload) => {
    setDirty(true);
    if (operation) {
      sendOperation(operation);
      return;
    }

    const current = useBoardStore.getState().board;
    if (current && current.sharedAllowAnonymousEditing) {
      sendBoardState(current, changeKind);
    }
  }, [sendBoardState, sendOperation, setDirty]);

  const onBoardLiveChanged = useCallback((_changeKind: string, operation?: BoardOperationPayload) => {
    if (operation) {
      sendOperationThrottled(operation);
    }
  }, [sendOperationThrottled]);

  const handleToggleComments = useCallback(() => {
    setCommentsOpen((current) => {
      const next = !current;
      if (next && isNarrowPanelMode) {
        setPropertiesOpen(false);
      } else if (!next) {
        setCommentPlacementMode(false);
        setPendingCommentAnchor(null);
      }

      return next;
    });
  }, [isNarrowPanelMode]);

  const handleSelectComment = useCallback((commentId: string) => {
    setActiveCommentId(commentId);
    setCommentsOpen(true);
    setCommentPlacementMode(false);
    setPendingCommentAnchor(null);
  }, []);

  const handleStartComment = useCallback(() => {
    if (!canCreateComments) {
      return;
    }

    setCommentsOpen(true);
    setCommentPlacementMode(true);
    setPendingCommentAnchor(null);
  }, [canCreateComments]);

  const handleCommentAnchorSelected = useCallback((position: { x: number; y: number }) => {
    if (!canCreateComments) {
      return;
    }

    setCommentsOpen(true);
    setCommentPlacementMode(false);
    setPendingCommentAnchor(position);
  }, [canCreateComments]);

  const handleCancelPendingComment = useCallback(() => {
    setCommentPlacementMode(false);
    setPendingCommentAnchor(null);
  }, []);

  const handleCreateComment = useCallback(async (text: string) => {
    if (!pendingCommentAnchor) {
      return;
    }

    const comment = await createCommentAt(pendingCommentAnchor.x, pendingCommentAnchor.y, text);
    setPendingCommentAnchor(null);
    setCommentPlacementMode(false);
    setActiveCommentId(comment.id);
    setCommentsOpen(true);
  }, [createCommentAt, pendingCommentAnchor]);

  const handleCreateReply = useCallback(async (commentId: string, text: string) => {
    const comment = await createReply(commentId, text);
    setActiveCommentId(comment.id);
  }, [createReply]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    await removeBoardComment(commentId);
    if (activeCommentId === commentId) {
      setActiveCommentId(null);
    }
  }, [activeCommentId, removeBoardComment]);

  const handleDeleteReply = useCallback(async (commentId: string, replyId: string) => {
    const comment = await removeBoardCommentReply(commentId, replyId);
    setActiveCommentId(comment.id);
  }, [removeBoardCommentReply]);

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
        onOpenComments={handleToggleComments}
        onOpenChat={() => {}}
        propertiesOpen={propertiesOpen}
        commentsOpen={commentsOpen}
        chatOpen={false}
        syncStatus={boardSyncStatus}
        titleEditable={false}
        showShare={false}
        showExport={false}
        showChat={false}
        showProperties={board.sharedAllowAnonymousEditing}
        showComments
        showBackButton={false}
        onBoardChanged={onBoardChanged}
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
        {board.sharedAllowAnonymousEditing && !compactOverlayOpen && <Toolbar onBoardChanged={onBoardChanged} canvasContainerRef={canvasBoxRef} />}
        <Box ref={canvasBoxRef} sx={{ flex: 1, position: 'relative' }}>
          <WhiteboardCanvas
            editable={board.sharedAllowAnonymousEditing}
            localPresenceClientId={connectionId}
            onBoardChanged={onBoardChanged}
            onBoardLiveChanged={onBoardLiveChanged}
            onPointerPresenceChanged={handlePointerPresenceChanged}
            selectedCommentId={activeCommentId}
            commentPlacementMode={commentPlacementMode}
            onSelectComment={handleSelectComment}
            onCreateCommentAnchor={handleCommentAnchorSelected}
            liveAnnouncement={liveAnnouncement}
          />

          {!isNarrowPanelMode && commentsOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0,
                width: COMMENTS_PANEL_WIDTH,
                zIndex: 5,
                boxShadow: 6,
              }}
            >
              <CommentsPanel
                comments={comments}
                activeCommentId={activeCommentId}
                pendingAnchor={pendingCommentAnchor}
                commentPlacementMode={commentPlacementMode}
                canCreateComments={canCreateComments}
                currentUserId={user?.id ?? null}
                boardOwnerId={board.ownerId}
                isCreatingComment={isCreatingComment}
                isCreatingReply={isCreatingReply}
                deletingCommentId={deletingCommentId}
                deletingReply={deletingReply}
                onClose={() => {
                  setCommentsOpen(false);
                  setCommentPlacementMode(false);
                  setPendingCommentAnchor(null);
                }}
                onSelectComment={handleSelectComment}
                onStartComment={handleStartComment}
                onCancelPendingComment={handleCancelPendingComment}
                onCreateComment={handleCreateComment}
                onCreateReply={handleCreateReply}
                onDeleteComment={handleDeleteComment}
                onDeleteReply={handleDeleteReply}
              />
            </Box>
          )}

          {board.sharedAllowAnonymousEditing && !isNarrowPanelMode && propertiesOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: commentsOpen ? COMMENTS_PANEL_WIDTH : 0,
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

      {isNarrowPanelMode && (
        <Drawer
          anchor="right"
          open={commentsOpen}
          onClose={() => {
            setCommentsOpen(false);
            setCommentPlacementMode(false);
            setPendingCommentAnchor(null);
          }}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: '100vw',
              maxWidth: '100vw',
            },
          }}
        >
          <CommentsPanel
            comments={comments}
            activeCommentId={activeCommentId}
            pendingAnchor={pendingCommentAnchor}
            commentPlacementMode={commentPlacementMode}
            canCreateComments={canCreateComments}
            currentUserId={user?.id ?? null}
            boardOwnerId={board.ownerId}
            isCreatingComment={isCreatingComment}
            isCreatingReply={isCreatingReply}
            deletingCommentId={deletingCommentId}
            deletingReply={deletingReply}
            mobile
            onClose={() => {
              setCommentsOpen(false);
              setCommentPlacementMode(false);
              setPendingCommentAnchor(null);
            }}
            onSelectComment={handleSelectComment}
            onStartComment={handleStartComment}
            onCancelPendingComment={handleCancelPendingComment}
            onCreateComment={handleCreateComment}
            onCreateReply={handleCreateReply}
            onDeleteComment={handleDeleteComment}
            onDeleteReply={handleDeleteReply}
          />
        </Drawer>
      )}

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

      <Snackbar
        open={!!commandConflict}
        autoHideDuration={5000}
        onClose={() => clearCommandConflict()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" variant="filled" onClose={() => clearCommandConflict()} sx={{ width: '100%' }}>
          {commandConflict ? formatBoardCommandConflict(commandConflict) : ''}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!commentError}
        autoHideDuration={5000}
        onClose={() => clearCommentError()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => clearCommentError()} sx={{ width: '100%' }}>
          {commentError ?? ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
