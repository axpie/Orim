import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Drawer, Snackbar, useMediaQuery, useTheme } from '@mui/material';
import { getAssistantAvailability } from '../../api/assistantSettings';
import { createSnapshot, getBoard, restoreSnapshot, updateBoard } from '../../api/boards';
import { useBoardComments } from './comments/useBoardComments';
import { useBoardStore } from './store/boardStore';
import { useCommandStack } from './store/commandStack';
import { formatBoardCommandConflict } from './realtime/localBoardCommands';
import { useSignalR } from '../../hooks/useSignalR';
import { WhiteboardCanvas } from './canvas/WhiteboardCanvas';
import { Toolbar } from './tools/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ChatPanel } from './panels/ChatPanel';
import { CommentsPanel, COMMENTS_PANEL_WIDTH } from './panels/CommentsPanel';
import { SnapshotDialog } from './panels/SnapshotDialog';
import { BoardTopBar } from './tools/BoardTopBar';
import { deriveBoardSyncStatus } from './boardSyncStatus';
import { getBoardSyncAnnouncement } from './a11yAnnouncements';
import { useOperationOutboxStore } from './store/outboxStore';
import type { Board, BoardSnapshot } from '../../types/models';
import { BoardRole } from '../../types/models';
import { useAuthStore } from '../../stores/authStore';
import type { BoardOperationPayload } from './realtime/boardOperations';

const PROPERTIES_PANEL_WIDTH = 280;
const CHAT_PANEL_WIDTH = 320;

function sortSnapshots(snapshots: BoardSnapshot[]) {
  return [...snapshots].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function createBoardFileName(title: string | undefined, extension: string) {
  const baseName = (title?.trim() || 'board').replace(/[\\/:*?"<>|]+/g, '-');
  return `${baseName}.${extension}`;
}

export function WhiteboardEditor() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isNarrowPanelMode = useMediaQuery(theme.breakpoints.down('sm'));
  const isMediumDown = useMediaQuery(theme.breakpoints.down('md'));
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');
  const isCompactToolbarLayout = isMediumDown || isCoarsePointer;
  const setBoard = useBoardStore((s) => s.setBoard);
  const applyRemoteOperation = useBoardStore((s) => s.applyRemoteOperation);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const setViewportInsets = useBoardStore((s) => s.setViewportInsets);
  const user = useAuthStore((s) => s.user);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const commandConflict = useBoardStore((s) => s.commandConflict);
  const clearCommandConflict = useBoardStore((s) => s.clearCommandConflict);
  const outboxCount = useOperationOutboxStore((s) => (id ? s.countForBoard(id) : 0));
  const clearCommandStack = useCommandStack((s) => s.clear);

  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<{ x: number; y: number } | null>(null);
  const [commentPlacementMode, setCommentPlacementMode] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSavePromiseRef = useRef<Promise<Board | null> | null>(null);
  const liveAnnouncementIdRef = useRef(0);
  const lastSyncAnnouncementRef = useRef<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const compactOverlayOpen = isCompactToolbarLayout && (propertiesOpen || commentsOpen || chatOpen);

  const currentMembership = user && board
    ? board.members.find((member) => member.userId === user.id) ?? (board.ownerId === user.id
      ? { userId: user.id, username: user.username, role: BoardRole.Owner }
      : null)
    : null;
  const canEdit = currentMembership != null && currentMembership.role !== BoardRole.Viewer;
  const canShare = currentMembership?.role === BoardRole.Owner;
  const comments = board?.comments ?? [];

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
  } = useBoardComments(id ?? null);

  const { data: assistantAvailability } = useQuery({
    queryKey: ['assistant-availability'],
    queryFn: getAssistantAvailability,
    enabled: canEdit,
    staleTime: 30_000,
  });

  const canUseAssistant = canEdit && Boolean(assistantAvailability?.isConfigured);

  const openPropertiesPanel = useCallback(() => {
    setPropertiesOpen((current) => {
      const next = !current;
      if (next && isNarrowPanelMode) {
        setChatOpen(false);
      }

      return next;
    });
  }, [isNarrowPanelMode]);

  const openChatPanel = useCallback(() => {
    setChatOpen((current) => {
      const next = !current;
      if (next && isNarrowPanelMode) {
        setPropertiesOpen(false);
        setCommentsOpen(false);
      }

      return next;
    });
  }, [isNarrowPanelMode]);

  const openCommentsPanel = useCallback(() => {
    setCommentsOpen((current) => {
      const next = !current;
      if (next && isNarrowPanelMode) {
        setPropertiesOpen(false);
        setChatOpen(false);
      } else if (!next) {
        setCommentPlacementMode(false);
        setPendingCommentAnchor(null);
      }

      return next;
    });
  }, [isNarrowPanelMode]);

  const { data, isError } = useQuery({
    queryKey: ['board', id],
    queryFn: () => getBoard(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) {
      const currentBoardId = useBoardStore.getState().board?.id;
      const preserveSelection = currentBoardId === data.id;
      setBoard(data as Board, { preserveSelection });
      if (!preserveSelection) {
        setRemoteCursors([]);
        clearCommandStack();
      }
    }
  }, [clearCommandStack, data, setBoard, setRemoteCursors]);

  useEffect(() => {
    if (isError) {
      navigate('/');
    }
  }, [isError, navigate]);

  const saveMutation = useMutation({
    mutationFn: (boardPatch: Partial<Board>) => updateBoard(id!, boardPatch),
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
    if (!current || !id) {
      return null;
    }

    const elementsAtSaveStart = current.elements;

    const savePromise = saveMutation.mutateAsync({
      title: current.title,
      labelOutlineEnabled: current.labelOutlineEnabled,
      arrowOutlineEnabled: current.arrowOutlineEnabled,
      customColors: current.customColors,
      recentColors: current.recentColors,
      stickyNotePresets: current.stickyNotePresets,
      elements: current.elements,
    }).then(() => {
      const latestBoard = useBoardStore.getState().board;
      // Only mark clean when no new element changes arrived during the in-flight save.
      // Zustand produces a new array reference on every mutation, so reference equality
      // reliably detects concurrent edits without deep comparison.
      if (latestBoard?.elements === elementsAtSaveStart) {
        setDirty(false);
      }
      // Persist local (potentially newer) state into the query cache rather than
      // overwriting it with the server response, which may lag behind local edits.
      queryClient.setQueryData(['board', id], latestBoard);
      return latestBoard ?? null;
    });

    activeSavePromiseRef.current = savePromise;

    try {
      return await savePromise;
    } finally {
      if (activeSavePromiseRef.current === savePromise) {
        activeSavePromiseRef.current = null;
      }
    }
  }, [id, queryClient, saveMutation, setDirty]);

  const waitForActiveSave = useCallback(async () => {
    const activeSavePromise = activeSavePromiseRef.current;
    if (!activeSavePromise) {
      return;
    }

    try {
      await activeSavePromise;
    } catch {
      // The current UI already surfaces the mutation error state.
    }
  }, []);

  const scheduleSave = useCallback(() => {
    clearScheduledSave();
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistCurrentBoard();
    }, 1500);
  }, [clearScheduledSave, persistCurrentBoard]);

  useEffect(() => {
    if (!canEdit || !isDirty || !board) {
      return;
    }

    scheduleSave();
  }, [
    board?.elements,
    board?.title,
    board?.labelOutlineEnabled,
    board?.arrowOutlineEnabled,
    board?.customColors,
    board?.recentColors,
    board?.stickyNotePresets,
    canEdit,
    isDirty,
    scheduleSave,
  ]);

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  useEffect(() => {
    if (!canUseAssistant && chatOpen) {
      setChatOpen(false);
    }
  }, [canUseAssistant, chatOpen]);

  useEffect(() => {
    if (!canEdit || isNarrowPanelMode) {
      setViewportInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }

    setViewportInsets({
      top: 0,
      right:
        (commentsOpen ? COMMENTS_PANEL_WIDTH : 0)
        + (chatOpen ? CHAT_PANEL_WIDTH : 0)
        + (propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0),
      bottom: 0,
      left: 0,
    });
  }, [canEdit, chatOpen, commentsOpen, isNarrowPanelMode, propertiesOpen, setViewportInsets]);

  useEffect(() => {
    if (activeCommentId && !comments.some((comment) => comment.id === activeCommentId)) {
      setActiveCommentId(null);
    }
  }, [activeCommentId, comments]);

  const {
    sendBoardState,
    sendOperation,
    sendOperationThrottled,
    sendCursorUpdate,
    connectionId,
    connectionState,
    lastError,
  } = useSignalR({
    boardId: id ?? null,
    displayName: user?.displayName ?? user?.username ?? null,
    syncProfileDisplayNameChanges: true,
    onBoardOperationApplied: (notification) => {
      applyRemoteOperation(notification.operation);
      const nextBoard = useBoardStore.getState().board;
      if (id && nextBoard) {
        queryClient.setQueryData(['board', id], nextBoard);
      }
    },
    onBoardStateUpdated: (notification) => {
      setBoard(notification.board, { preserveSelection: true });
      clearCommandStack();
      if (id) {
        queryClient.setQueryData(['board', id], notification.board);
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

  const handleStageReady = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  const handleExportPng = useCallback(async () => {
    const stage = stageRef.current;
    const current = useBoardStore.getState().board;
    if (!stage || !current) {
      return;
    }

    const transientLayer = stage.findOne('.whiteboard-export-hidden') as Konva.Layer | null;
    const previousVisibility = transientLayer?.visible() ?? true;

    if (transientLayer) {
      transientLayer.visible(false);
      stage.batchDraw();
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = stage.toDataURL({
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        mimeType: 'image/png',
      });
      anchor.download = createBoardFileName(current.title, 'png');
      anchor.click();
    } finally {
      if (transientLayer) {
        transientLayer.visible(previousVisibility);
        stage.batchDraw();
      }
    }
  }, []);

  const handleCreateSnapshot = useCallback(async (name?: string) => {
    clearScheduledSave();
    await waitForActiveSave();

    if (useBoardStore.getState().isDirty) {
      await persistCurrentBoard();
    }

    if (!id) {
      return;
    }

    const snapshot = await createSnapshot(id, name);
    const current = useBoardStore.getState().board;
    if (!current) {
      return;
    }

    const nextBoard = {
      ...current,
      snapshots: sortSnapshots([
        ...current.snapshots.filter((entry) => entry.id !== snapshot.id),
        snapshot,
      ]),
    };

    setBoard(nextBoard, { preserveSelection: true });
    queryClient.setQueryData(['board', id], nextBoard);
  }, [clearScheduledSave, id, persistCurrentBoard, queryClient, setBoard, waitForActiveSave]);

  const handleRestoreSnapshot = useCallback(async (snapshotId: string) => {
    clearScheduledSave();
    await waitForActiveSave();

    if (!id) {
      return;
    }

    const restoredBoard = await restoreSnapshot(id, snapshotId);
    setBoard(restoredBoard, { preserveSelection: false, resetTool: true });
    clearCommandStack();
    setDirty(false);
    queryClient.setQueryData(['board', id], restoredBoard);
    announceLive(t('a11y.snapshotRestored'));
  }, [announceLive, clearCommandStack, clearScheduledSave, id, queryClient, setBoard, setDirty, t, waitForActiveSave]);

  const onBoardChanged = useCallback((changeKind: string, operation?: BoardOperationPayload) => {
    if (!canEdit) {
      return;
    }

    setDirty(true);
    if (operation) {
      sendOperation(operation);
      return;
    }

    const current = useBoardStore.getState().board;
    if (current) {
      sendBoardState(current, changeKind);
    }
  }, [canEdit, sendBoardState, sendOperation, setDirty]);

  const onBoardLiveChanged = useCallback((_changeKind: string, operation?: BoardOperationPayload) => {
    if (!canEdit) {
      return;
    }

    if (operation) {
      sendOperationThrottled(operation);
    }
  }, [canEdit, sendOperationThrottled]);

  const handleSelectComment = useCallback((commentId: string) => {
    setActiveCommentId(commentId);
    setCommentsOpen(true);
    setCommentPlacementMode(false);
    setPendingCommentAnchor(null);
  }, []);

  const handleStartComment = useCallback(() => {
    if (!canEdit) {
      return;
    }

    setCommentsOpen(true);
    setCommentPlacementMode(true);
    setPendingCommentAnchor(null);
  }, [canEdit]);

  const handleCommentAnchorSelected = useCallback((position: { x: number; y: number }) => {
    if (!canEdit) {
      return;
    }

    setCommentsOpen(true);
    setCommentPlacementMode(false);
    setPendingCommentAnchor(position);
  }, [canEdit]);

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

  if (!board) return null;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' }}>
      <BoardTopBar
        onOpenProperties={openPropertiesPanel}
        onOpenComments={openCommentsPanel}
        onOpenChat={openChatPanel}
        propertiesOpen={propertiesOpen}
        commentsOpen={commentsOpen}
        chatOpen={chatOpen}
        syncStatus={boardSyncStatus}
        titleEditable={canEdit}
        showShare={canShare}
        showProperties={canEdit}
        showComments
        showChat={canUseAssistant}
        showSnapshots={canEdit}
        onBoardChanged={onBoardChanged}
        onOpenSnapshots={() => setSnapshotsOpen(true)}
        onExportPng={handleExportPng}
        collaborators={remoteCursors}
        localConnectionId={connectionId}
      />
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {canEdit && !compactOverlayOpen && <Toolbar onBoardChanged={onBoardChanged} />}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <WhiteboardCanvas
            editable={canEdit}
            localPresenceClientId={connectionId}
            onBoardChanged={onBoardChanged}
            onBoardLiveChanged={onBoardLiveChanged}
            onPointerPresenceChanged={sendCursorUpdate}
            onStageReady={handleStageReady}
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
                right: (propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0) + (chatOpen ? CHAT_PANEL_WIDTH : 0),
                width: COMMENTS_PANEL_WIDTH,
                zIndex: 4,
                boxShadow: 6,
              }}
            >
              <CommentsPanel
                comments={comments}
                activeCommentId={activeCommentId}
                pendingAnchor={pendingCommentAnchor}
                commentPlacementMode={commentPlacementMode}
                canCreateComments={canEdit}
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

          {canEdit && !isNarrowPanelMode && chatOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: `${(propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0) + (commentsOpen ? COMMENTS_PANEL_WIDTH : 0)}px`,
                width: CHAT_PANEL_WIDTH,
                zIndex: 4,
                boxShadow: 6,
              }}
            >
              <ChatPanel boardId={id!} onClose={() => setChatOpen(false)} onBoardChanged={onBoardChanged} />
            </Box>
          )}

          {canEdit && !isNarrowPanelMode && propertiesOpen && (
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
            canCreateComments={canEdit}
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

      {canEdit && isNarrowPanelMode && (
        <Drawer
          anchor="right"
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: '100vw',
              maxWidth: '100vw',
            },
          }}
        >
          <ChatPanel
            boardId={id!}
            mobile
            onClose={() => setChatOpen(false)}
            onBoardChanged={onBoardChanged}
          />
        </Drawer>
      )}

      {canEdit && isNarrowPanelMode && (
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

      {canEdit && (
        <SnapshotDialog
          open={snapshotsOpen}
          snapshots={board.snapshots}
          onClose={() => setSnapshotsOpen(false)}
          onCreateSnapshot={handleCreateSnapshot}
          onRestoreSnapshot={handleRestoreSnapshot}
        />
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
