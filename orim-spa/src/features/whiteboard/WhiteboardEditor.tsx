import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, IconButton, Snackbar, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getAssistantAvailability } from '../../api/assistantSettings';
import { createSnapshot, getBoard, restoreSnapshot, saveBoard } from '../../api/boards';
import { useBoardComments } from './comments/useBoardComments';
import { useBoardStore } from './store/boardStore';
import { useCommandStack } from './store/commandStack';
import { formatBoardCommandConflict } from './realtime/localBoardCommands';
import { WhiteboardCanvas } from './canvas/WhiteboardCanvas';
import { FloatingToolbar } from './canvas/FloatingToolbar';
import { CanvasSearch } from './canvas/CanvasSearch';
import { Minimap } from './canvas/Minimap';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toolbar } from './tools/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ChatPanel } from './panels/ChatPanel';
import { CommentsPanel } from './panels/CommentsPanel';
import { SnapshotDialog } from './panels/SnapshotDialog';
import { AuxiliaryPanelHost } from './panels/AuxiliaryPanelHost';
import { getAuxiliaryPanelWidth, toggleAuxiliaryPanel, type AuxiliaryPanelKind } from './panels/auxiliaryPanels';
import { BoardTopBar } from './tools/BoardTopBar';
import { PresentationMode } from './PresentationMode';
import { useWhiteboardRealtime } from './useWhiteboardRealtime';
import { useOperationOutboxStore } from './store/outboxStore';
import type { Board, BoardSnapshot } from '../../types/models';
import { BoardRole } from '../../types/models';
import { useAuthStore } from '../../stores/authStore';
import type { BoardOperationPayload } from './realtime/boardOperations';

const EMPTY_COMMENTS: Board['comments'] = [];

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
  const setBoard = useBoardStore((s) => s.setBoard);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const applyRemoteOperation = useBoardStore((s) => s.applyRemoteOperation);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const setViewportInsets = useBoardStore((s) => s.setViewportInsets);
  const user = useAuthStore((s) => s.user);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const followingClientId = useBoardStore((s) => s.followingClientId);
  const setFollowingClientId = useBoardStore((s) => s.setFollowingClientId);
  const setCamera = useBoardStore((s) => s.setCamera);
  const commandConflict = useBoardStore((s) => s.commandConflict);
  const clearCommandConflict = useBoardStore((s) => s.clearCommandConflict);
  const selectedElementIds = useBoardStore((s) => s.selectedElementIds);
  const activeTool = useBoardStore((s) => s.activeTool);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);
  const zoom = useBoardStore((s) => s.zoom);
  const viewportWidth = useBoardStore((s) => s.viewportWidth);
  const viewportHeight = useBoardStore((s) => s.viewportHeight);
  const outboxCount = useOperationOutboxStore((s) => (id ? s.countForBoard(id) : 0));
  const clearCommandStack = useCommandStack((s) => s.clear);

  const [activePanel, setActivePanel] = useState<AuxiliaryPanelKind | null>(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<{ x: number; y: number } | null>(null);
  const [commentPlacementMode, setCommentPlacementMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSavePromiseRef = useRef<Promise<Board | null> | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const liveAnnouncementIdRef = useRef(0);
  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const propertiesOpen = activePanel === 'properties';
  const commentsOpen = activePanel === 'comments';
  const chatOpen = activePanel === 'assistant';
  const compactOverlayOpen = isNarrowPanelMode && activePanel != null;

  const currentMembership = user && board
    ? board.members.find((member) => member.userId === user.id) ?? (board.ownerId === user.id
      ? { userId: user.id, username: user.username, role: BoardRole.Owner }
      : null)
    : null;
  const canEdit = currentMembership != null && currentMembership.role !== BoardRole.Viewer;
  const canShare = currentMembership?.role === BoardRole.Owner;
  const comments = board?.comments ?? EMPTY_COMMENTS;

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
    setActivePanel((current) => toggleAuxiliaryPanel(current, 'properties'));
  }, []);

  const openChatPanel = useCallback(() => {
    setActivePanel((current) => toggleAuxiliaryPanel(current, 'assistant'));
  }, []);

  const openCommentsPanel = useCallback(() => {
    setActivePanel((current) => toggleAuxiliaryPanel(current, 'comments'));
  }, []);

  const closeActivePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

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
    mutationFn: ({ board: currentBoard, changeKind }: { board: Board; changeKind: 'Content' | 'Metadata' }) =>
      saveBoard(id!, currentBoard, connectionIdRef.current, changeKind),
  });

  const clearScheduledSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistCurrentBoard = useCallback(async (changeKind: 'Content' | 'Metadata' = 'Content'): Promise<Board | null> => {
    if (activeSavePromiseRef.current) {
      try {
        await activeSavePromiseRef.current;
      } catch {
        // Keep the latest mutation error in React Query state.
      }

      if (changeKind === 'Content' && !useBoardStore.getState().isDirty) {
        return useBoardStore.getState().board;
      }
    }

    const current = useBoardStore.getState().board;
    if (!current || !id) {
      return null;
    }

    const elementsAtSaveStart = current.elements;
    const titleAtSaveStart = current.title;

    const savePromise = saveMutation.mutateAsync({
      board: current,
      changeKind,
    }).then(() => {
      const latestBoard = useBoardStore.getState().board;
      // Only mark clean when no new element changes arrived during the in-flight save.
      // Zustand produces a new array reference on element edits, and title renames replace
      // the board object, so this preserves dirty state when a newer local edit landed.
      if (latestBoard?.elements === elementsAtSaveStart && latestBoard?.title === titleAtSaveStart) {
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
    board,
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
    if (!canUseAssistant && activePanel === 'assistant') {
      setActivePanel(null);
    }
  }, [activePanel, canUseAssistant]);

  useEffect(() => {
    if (!canEdit && (activePanel === 'assistant' || activePanel === 'properties')) {
      setActivePanel(null);
    }
  }, [activePanel, canEdit]);

  useEffect(() => {
    setViewportInsets({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  }, [setViewportInsets]);

  useEffect(() => {
    if (activePanel !== 'comments') {
      setCommentPlacementMode(false);
      setPendingCommentAnchor(null);
    }
  }, [activePanel]);

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
    boardSyncStatus,
  } = useWhiteboardRealtime({
    boardId: id ?? null,
    displayName: user?.displayName ?? user?.username ?? null,
    canEdit,
    board,
    isDirty,
    outboxCount,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    queryClient,
    setBoard,
    clearCommandStack,
    applyRemoteOperation,
    onCommentUpserted: handleCommentUpserted,
    onCommentDeleted: handleCommentDeleted,
    setRemoteCursors,
    announceLive,
    t,
    scheduleSave,
  });
  useEffect(() => {
    connectionIdRef.current = connectionId;
  }, [connectionId]);

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

  // Broadcast selected element IDs to remote collaborators
  useEffect(() => {
    if (connectionState === 'connected') {
      sendCursorUpdate(null, null, selectedElementIds.length > 0 ? selectedElementIds : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, connectionState]);

  // Auto-follow: pan to the followed user's cursor position on cursor updates
  useEffect(() => {
    if (!followingClientId) return;
    const followed = remoteCursors.find((c) => c.clientId === followingClientId);
    if (!followed) {
      setFollowingClientId(null);
      return;
    }
    if (followed.worldX == null || followed.worldY == null) return;
    const { zoom, viewportWidth, viewportHeight } = useBoardStore.getState();
    setCamera(
      followed.worldX - viewportWidth / (2 * zoom),
      followed.worldY - viewportHeight / (2 * zoom),
    );
  }, [followingClientId, remoteCursors, setCamera, setFollowingClientId]);

  const handlePointerPresenceChanged = useCallback(
    (worldX: number | null, worldY: number | null) => {
      const currentSelection = useBoardStore.getState().selectedElementIds;
      sendCursorUpdate(worldX, worldY, currentSelection.length > 0 ? currentSelection : undefined);
    },
    [sendCursorUpdate],
  );

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

  const handleRenameTitle = useCallback((nextTitle: string, previousTitle: string) => {
    if (!id) {
      return;
    }

    const currentBoard = useBoardStore.getState().board;
    if (!currentBoard) {
      return;
    }

    queryClient.setQueryData(['board', id], currentBoard);
    clearScheduledSave();
    void persistCurrentBoard('Metadata').catch(() => {
      const latestBoard = useBoardStore.getState().board;
      if (!latestBoard || latestBoard.id !== id || latestBoard.title !== nextTitle) {
        return;
      }

      setBoardTitle(previousTitle);
      queryClient.setQueryData(['board', id], {
        ...latestBoard,
        title: previousTitle,
      });
    });
  }, [clearScheduledSave, id, persistCurrentBoard, queryClient, setBoardTitle]);

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
    setActivePanel('comments');
    setCommentPlacementMode(false);
    setPendingCommentAnchor(null);
  }, []);

  const handleStartComment = useCallback(() => {
    if (!canEdit) {
      return;
    }

    setActivePanel('comments');
    setCommentPlacementMode(true);
    setPendingCommentAnchor(null);
  }, [canEdit]);

  const handleCommentAnchorSelected = useCallback((position: { x: number; y: number }) => {
    if (!canEdit) {
      return;
    }

    setActivePanel('comments');
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
    setActivePanel('comments');
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

  const toggleMinimap = useCallback(() => setMinimapVisible((v) => !v), []);

  const handleMinimapNavigate = useCallback((worldX: number, worldY: number) => {
    setCamera(
      -(worldX * zoom) + viewportWidth / 2,
      -(worldY * zoom) + viewportHeight / 2,
    );
  }, [setCamera, zoom, viewportWidth, viewportHeight]);

  if (!board) return null;

  const hasFrames = board.elements.some((el) => el.$type === 'frame');

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' }}>
      {!presentationMode && (
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
          onRenameTitle={handleRenameTitle}
          onBoardChanged={onBoardChanged}
          onOpenSnapshots={() => setSnapshotsOpen(true)}
          onExportPng={handleExportPng}
          onStartPresentation={() => setPresentationMode(true)}
          hasFrames={hasFrames}
          collaborators={remoteCursors}
          localConnectionId={connectionId}
        />
      )}
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {canEdit && !compactOverlayOpen && !presentationMode && <Toolbar onBoardChanged={onBoardChanged} canvasContainerRef={canvasBoxRef} minimapVisible={minimapVisible} onToggleMinimap={toggleMinimap} />}
        <Box ref={canvasBoxRef} sx={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
          <ErrorBoundary>
            <WhiteboardCanvas
              editable={canEdit}
              localPresenceClientId={connectionId}
              onBoardChanged={onBoardChanged}
              onBoardLiveChanged={onBoardLiveChanged}
              onPointerPresenceChanged={handlePointerPresenceChanged}
              onStageReady={handleStageReady}
              selectedCommentId={activeCommentId}
              commentPlacementMode={commentPlacementMode}
              onSelectComment={handleSelectComment}
              onCreateCommentAnchor={handleCommentAnchorSelected}
              liveAnnouncement={liveAnnouncement}
              onOpenSearch={() => setSearchOpen(true)}
            />
          </ErrorBoundary>

          {followingClientId && (() => {
            const followed = remoteCursors.find((c) => c.clientId === followingClientId);
            if (!followed) return null;
            return (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 32,
                  bgcolor: followed.colorHex,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  gap: 1,
                }}
              >
                <Typography variant="caption" fontWeight={600}>
                  {t('board.followingUser', { name: followed.displayName, defaultValue: 'Following {{name}}' })}
                </Typography>
                <IconButton size="small" onClick={() => setFollowingClientId(null)} sx={{ color: 'white', p: 0.25 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })()}

          {canEdit && !presentationMode && selectedElementIds.length > 0 && activeTool === 'select' && (
            <FloatingToolbar
              elements={board.elements}
              selectedIds={selectedElementIds}
              zoom={zoom}
              cameraX={cameraX}
              cameraY={cameraY}
              onBoardChanged={onBoardChanged}
              onOpenPropertiesPanel={() => setActivePanel('properties')}
            />
          )}

          {searchOpen && !presentationMode && <CanvasSearch onClose={() => setSearchOpen(false)} />}

          {minimapVisible && !presentationMode && (
            <Box sx={{ position: 'absolute', bottom: 80, right: 16, zIndex: 10 }}>
              <Minimap
                elements={board.elements}
                cameraX={cameraX}
                cameraY={cameraY}
                zoom={zoom}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                onNavigate={handleMinimapNavigate}
                onClose={toggleMinimap}
              />
            </Box>
          )}

          {!presentationMode && (
            <AuxiliaryPanelHost
              open={activePanel != null}
              mobile={isNarrowPanelMode}
              width={getAuxiliaryPanelWidth(activePanel)}
              onClose={closeActivePanel}
            >
            {activePanel === 'comments' && (
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
                mobile={isNarrowPanelMode}
                onClose={closeActivePanel}
                onSelectComment={handleSelectComment}
                onStartComment={handleStartComment}
                onCancelPendingComment={handleCancelPendingComment}
                onCreateComment={handleCreateComment}
                onCreateReply={handleCreateReply}
                onDeleteComment={handleDeleteComment}
                onDeleteReply={handleDeleteReply}
              />
            )}
            {activePanel === 'assistant' && canEdit && (
              <ChatPanel
                boardId={id!}
                mobile={isNarrowPanelMode}
                onClose={closeActivePanel}
                onBoardChanged={onBoardChanged}
              />
            )}
            {activePanel === 'properties' && canEdit && (
              <PropertiesPanel
                mobile={isNarrowPanelMode}
                onClose={closeActivePanel}
                onBoardChanged={onBoardChanged}
              />
            )}
          </AuxiliaryPanelHost>
          )}
        </Box>
      </Box>

      {presentationMode && board && (
        <PresentationMode
          board={board}
          onExit={() => setPresentationMode(false)}
        />
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
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => clearCommandConflict()}
          sx={{ width: '100%' }}
          action={
            <Button color="inherit" size="small" onClick={() => clearCommandConflict()}>
              {t('common.confirm')}
            </Button>
          }
        >
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
