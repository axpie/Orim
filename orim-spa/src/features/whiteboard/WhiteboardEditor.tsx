import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, IconButton, Snackbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MapIcon from '@mui/icons-material/Map';
import { getAssistantAvailability } from '../../api/assistantSettings';
import { createSnapshot, getBoard, restoreSnapshot, saveBoard } from '../../api/boards';
import { useBoardStore } from './store/boardStore';
import { useCommandStack } from './store/commandStack';
import { formatBoardCommandConflict } from './realtime/localBoardCommands';
import { WhiteboardCanvas } from './canvas/WhiteboardCanvas';
import { FloatingToolbar } from './canvas/FloatingToolbar';
import { CanvasSearch } from './canvas/CanvasSearch';
import { Minimap } from './canvas/Minimap';
import { RemoteCursorEdgeIndicators } from './canvas/RemoteCursorEdgeIndicators';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toolbar } from './tools/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ChatPanel } from './panels/ChatPanel';
import { SnapshotDialog } from './panels/SnapshotDialog';
import { AuxiliaryPanelHost } from './panels/AuxiliaryPanelHost';
import { getAuxiliaryPanelWidth, toggleAuxiliaryPanel, type AuxiliaryPanelKind } from './panels/auxiliaryPanels';
import { BoardTopBar } from './tools/BoardTopBar';
import { FollowMeInvitation } from './tools/FollowMeInvitation';
import { PresentationMode } from './PresentationMode';
import { useWhiteboardRealtime } from './useWhiteboardRealtime';
import { useFollowCamera } from './useFollowCamera';
import { useOperationOutboxStore } from './store/outboxStore';
import type { Board, BoardSnapshot, CursorPresence } from '../../types/models';
import { BoardRole } from '../../types/models';
import { useAuthStore } from '../../stores/authStore';
import type { BoardOperationPayload } from './realtime/boardOperations';
import { getCenteredCameraPosition, getFitToScreenViewport } from './cameraUtils';
import { exportStageAsPng } from './exportUtils';

function sortSnapshots(snapshots: BoardSnapshot[]) {
  return [...snapshots].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function normalizeSelectionScope(selection: string[]): string[] {
  return [...selection].sort();
}

function areSelectionsEqual(left: string[] | null, right: string[]): boolean {
  return left != null
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
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
  const isPresenting = useBoardStore((s) => s.isPresenting);
  const setIsPresenting = useBoardStore((s) => s.setIsPresenting);
  const setPresentingClientId = useBoardStore((s) => s.setPresentingClientId);
  const setCamera = useBoardStore((s) => s.setCamera);
  const setZoom = useBoardStore((s) => s.setZoom);
  const commandConflict = useBoardStore((s) => s.commandConflict);
  const clearCommandConflict = useBoardStore((s) => s.clearCommandConflict);
  const selectedElementIds = useBoardStore((s) => s.selectedElementIds);
  const activeTool = useBoardStore((s) => s.activeTool);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);
  const zoom = useBoardStore((s) => s.zoom);
  const viewportWidth = useBoardStore((s) => s.viewportWidth);
  const viewportHeight = useBoardStore((s) => s.viewportHeight);
  const viewportInsets = useBoardStore((s) => s.viewportInsets);
  const outboxCount = useOperationOutboxStore((s) => (id ? s.countForBoard(id) : 0));
  const clearCommandStack = useCommandStack((s) => s.clear);

  const [activePanel, setActivePanel] = useState<AuxiliaryPanelKind | null>(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [followMeInvitation, setFollowMeInvitation] = useState<{ clientId: string; displayName: string; colorHex?: string } | null>(null);
  const [followMeEndedSnackbar, setFollowMeEndedSnackbar] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [inlineEditingActive, setInlineEditingActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const [propertiesPanelSelectionScope, setPropertiesPanelSelectionScope] = useState<string[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSavePromiseRef = useRef<Promise<Board | null> | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const liveAnnouncementIdRef = useRef(0);
  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const initialFitBoardIdRef = useRef<string | null>(null);
  const propertiesOpen = activePanel === 'properties';
  const chatOpen = activePanel === 'assistant';
  const compactOverlayOpen = isNarrowPanelMode && activePanel != null;

  const currentMembership = user && board
    ? board.members.find((member) => member.userId === user.id) ?? (board.ownerId === user.id
      ? { userId: user.id, username: user.username, role: BoardRole.Owner }
      : null)
    : null;
  const canEdit = currentMembership != null && currentMembership.role !== BoardRole.Viewer;
  const canShare = currentMembership?.role === BoardRole.Owner;

  const announceLive = useCallback((text: string | null | undefined) => {
    const normalized = text?.trim();
    if (!normalized) {
      return;
    }

    liveAnnouncementIdRef.current += 1;
    setLiveAnnouncement({ id: liveAnnouncementIdRef.current, text: normalized });
  }, []);

  const { data: assistantAvailability } = useQuery({
    queryKey: ['assistant-availability'],
    queryFn: getAssistantAvailability,
    enabled: canEdit,
    staleTime: 30_000,
  });

  const canUseAssistant = canEdit && Boolean(assistantAvailability?.isConfigured);

  const openPropertiesPanel = useCallback(() => {
    setPropertiesPanelSelectionScope(null);
    setActivePanel((current) => toggleAuxiliaryPanel(current, 'properties'));
  }, []);

  const openSelectionScopedPropertiesPanel = useCallback(() => {
    setPropertiesPanelSelectionScope(normalizeSelectionScope(useBoardStore.getState().selectedElementIds));
    setActivePanel('properties');
  }, []);

  const openChatPanel = useCallback(() => {
    setActivePanel((current) => toggleAuxiliaryPanel(current, 'assistant'));
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
    if (!board || initialFitBoardIdRef.current === board.id) {
      return;
    }

    const containerRect = canvasBoxRef.current?.getBoundingClientRect();
    const effectiveWidth = containerRect?.width ?? viewportWidth;
    const effectiveHeight = containerRect?.height ?? viewportHeight;
    if (effectiveWidth <= 0 || effectiveHeight <= 0) {
      return;
    }

    initialFitBoardIdRef.current = board.id;
    const nextViewport = getFitToScreenViewport({
      elementsToFit: board.elements,
      viewportWidth: effectiveWidth,
      viewportHeight: effectiveHeight,
      viewportInsets,
    });
    if (!nextViewport) {
      return;
    }

    setZoom(nextViewport.zoom);
    setCamera(nextViewport.cameraX, nextViewport.cameraY);
  }, [board, setCamera, setZoom, viewportHeight, viewportInsets, viewportWidth]);

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
    if (activePanel !== 'properties') {
      setPropertiesPanelSelectionScope(null);
      return;
    }

    if (propertiesPanelSelectionScope == null) {
      return;
    }

    const nextSelectionScope = normalizeSelectionScope(selectedElementIds);
    if (!areSelectionsEqual(propertiesPanelSelectionScope, nextSelectionScope)) {
      setPropertiesPanelSelectionScope(null);
      setActivePanel(null);
    }
  }, [activePanel, propertiesPanelSelectionScope, selectedElementIds]);

  const {
    sendBoardState,
    sendOperation,
    sendOperationThrottled,
    sendCursorUpdate,
    startFollowMeSession,
    stopFollowMeSession,
    bringEveryoneToMe,
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
    setRemoteCursors,
    announceLive,
    t,
    scheduleSave,
    onFollowMeSessionStarted: (notification) => {
      const color = useBoardStore.getState().remoteCursors.find(
        (c) => c.clientId === notification.clientId,
      )?.colorHex;
      setFollowMeInvitation({
        clientId: notification.clientId,
        displayName: notification.displayName,
        colorHex: color,
      });
    },
    onFollowMeSessionEnded: (clientId) => {
      setFollowMeInvitation(null);
      useBoardStore.setState({ presentingClientId: null });
      if (useBoardStore.getState().followingClientId === clientId) {
        useBoardStore.getState().setFollowingClientId(null);
        setFollowMeEndedSnackbar(true);
      }
    },
    onBringToViewport: (notification) => {
      setZoom(notification.zoom);
      setCamera(notification.cameraX, notification.cameraY);
    },
  });
  useEffect(() => {
    connectionIdRef.current = connectionId;
  }, [connectionId]);

  useEffect(() => {
    if (commandConflict) {
      announceLive(formatBoardCommandConflict(commandConflict));
    }
  }, [announceLive, commandConflict]);

  // Broadcast selected element IDs to remote collaborators
  useEffect(() => {
    if (connectionState === 'connected') {
      const state = useBoardStore.getState();
      if (state.isPresenting) {
        sendCursorUpdate(
          null,
          null,
          selectedElementIds.length > 0 ? selectedElementIds : undefined,
          state.cameraX,
          state.cameraY,
          state.zoom,
        );
      } else {
        sendCursorUpdate(null, null, selectedElementIds.length > 0 ? selectedElementIds : undefined);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, connectionState]);

  useFollowCamera(followingClientId, remoteCursors, setFollowingClientId);

  const handlePointerPresenceChanged = useCallback(
    (worldX: number | null, worldY: number | null) => {
      const state = useBoardStore.getState();
      const currentSelection = state.selectedElementIds;
      if (state.isPresenting) {
        sendCursorUpdate(
          worldX,
          worldY,
          currentSelection.length > 0 ? currentSelection : undefined,
          state.cameraX,
          state.cameraY,
          state.zoom,
        );
      } else {
        sendCursorUpdate(worldX, worldY, currentSelection.length > 0 ? currentSelection : undefined);
      }
    },
    [sendCursorUpdate],
  );

  const handleStageReady = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  const handleStartFollowMe = useCallback(async () => {
    const sent = await startFollowMeSession();
    if (sent) {
      setIsPresenting(true);
    }
  }, [startFollowMeSession, setIsPresenting]);

  const handleStopFollowMe = useCallback(async () => {
    const sent = await stopFollowMeSession();
    if (sent) {
      setIsPresenting(false);
    }
  }, [stopFollowMeSession, setIsPresenting]);

  const handleBringEveryoneToMe = useCallback(() => {
    const state = useBoardStore.getState();
    void bringEveryoneToMe(state.cameraX, state.cameraY, state.zoom);
  }, [bringEveryoneToMe]);

  const handleFollowMeAccept = useCallback((clientId: string) => {
    setFollowMeInvitation(null);
    setFollowingClientId(clientId);
    setPresentingClientId(clientId);
  }, [setFollowingClientId, setPresentingClientId]);

  const handleExportPng = useCallback(async () => {
    const stage = stageRef.current;
    const current = useBoardStore.getState().board;
    if (!stage || !current) {
      return;
    }

    await exportStageAsPng(stage, current.title, canvasBoxRef.current);
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

  const toggleMinimap = useCallback(() => setMinimapVisible((v) => !v), []);

  const handleMinimapNavigate = useCallback((worldX: number, worldY: number) => {
    const { cameraX: nextCameraX, cameraY: nextCameraY } = getCenteredCameraPosition(
      worldX,
      worldY,
      zoom,
      viewportWidth,
      viewportHeight,
    );
    setCamera(nextCameraX, nextCameraY);
  }, [setCamera, zoom, viewportWidth, viewportHeight]);

  const handleJumpToCursor = useCallback((cursor: CursorPresence) => {
    if (cursor.worldX == null || cursor.worldY == null) {
      return;
    }

    const { cameraX: nextCameraX, cameraY: nextCameraY } = getCenteredCameraPosition(
      cursor.worldX,
      cursor.worldY,
      zoom,
      viewportWidth,
      viewportHeight,
    );
    setCamera(nextCameraX, nextCameraY);
  }, [setCamera, zoom, viewportWidth, viewportHeight]);

  if (!board) return null;

  const hasFrames = board.elements.some((el) => el.$type === 'frame');
  const minimapOverlayZIndex = 1350;
  const minimapRightOffset = !isNarrowPanelMode && activePanel != null
    ? getAuxiliaryPanelWidth(activePanel) + 16
    : 16;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' }}>
      {!presentationMode && (
        <BoardTopBar
          onOpenProperties={openPropertiesPanel}
          onOpenChat={openChatPanel}
          propertiesOpen={propertiesOpen}
          chatOpen={chatOpen}
          syncStatus={boardSyncStatus}
          titleEditable={canEdit}
          showShare={canShare}
          showProperties={canEdit}
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
          onStartFollowMe={remoteCursors.filter((c) => c.clientId !== connectionId).length > 0 ? handleStartFollowMe : undefined}
          onStopFollowMe={isPresenting ? handleStopFollowMe : undefined}
          onBringEveryoneToMe={remoteCursors.filter((c) => c.clientId !== connectionId).length > 0 ? handleBringEveryoneToMe : undefined}
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
              liveAnnouncement={liveAnnouncement}
              onOpenSearch={() => setSearchOpen(true)}
              onInlineEditingChange={setInlineEditingActive}
            />
          </ErrorBoundary>

          {followingClientId && (() => {
            const followed = remoteCursors.find((c) => c.clientId === followingClientId);
            if (!followed) return null;
            return (
              <Box
                data-whiteboard-export-hidden="true"
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

          {!presentationMode && (
            <RemoteCursorEdgeIndicators
              cursors={remoteCursors}
              localConnectionId={connectionId}
              zoom={zoom}
              cameraX={cameraX}
              cameraY={cameraY}
              viewportWidth={viewportWidth}
              viewportHeight={viewportHeight}
              followingClientId={followingClientId}
              onJumpToCursor={handleJumpToCursor}
            />
          )}

          {canEdit && !presentationMode && !inlineEditingActive && selectedElementIds.length > 0 && activeTool === 'select' && (
            <FloatingToolbar
              elements={board.elements}
              selectedIds={selectedElementIds}
              zoom={zoom}
              cameraX={cameraX}
              cameraY={cameraY}
              viewportWidth={viewportWidth}
              viewportHeight={viewportHeight}
              onBoardChanged={onBoardChanged}
              onOpenPropertiesPanel={openSelectionScopedPropertiesPanel}
            />
          )}

          {searchOpen && !presentationMode && <CanvasSearch onClose={() => setSearchOpen(false)} />}

          {minimapVisible && !presentationMode && (
            <Box
              data-whiteboard-export-hidden="true"
              sx={{ position: 'absolute', bottom: 'calc(72px + env(safe-area-inset-bottom))', right: minimapRightOffset, zIndex: minimapOverlayZIndex }}
            >
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
            <Box
              data-whiteboard-export-hidden="true"
              sx={{ position: 'absolute', bottom: 'calc(16px + env(safe-area-inset-bottom))', right: minimapRightOffset, zIndex: minimapOverlayZIndex }}
            >
              <Tooltip title={t('tools.minimap')} placement="left">
                <IconButton
                  aria-label={t('tools.minimap')}
                  onClick={toggleMinimap}
                  color={minimapVisible ? 'primary' : 'default'}
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <MapIcon />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {!presentationMode && (
            <Box data-whiteboard-export-hidden="true">
              <AuxiliaryPanelHost
                open={activePanel != null}
                mobile={isNarrowPanelMode}
                width={getAuxiliaryPanelWidth(activePanel)}
                onClose={closeActivePanel}
              >
                {(dragHandleProps) => (
                  <>
                  {activePanel === 'assistant' && canEdit && (
                    <ChatPanel
                      boardId={id!}
                      mobile={isNarrowPanelMode}
                      onClose={closeActivePanel}
                      onBoardChanged={onBoardChanged}
                      {...dragHandleProps}
                    />
                  )}
                  {activePanel === 'properties' && canEdit && (
                    <PropertiesPanel
                      mobile={isNarrowPanelMode}
                      onClose={closeActivePanel}
                      onBoardChanged={onBoardChanged}
                      {...dragHandleProps}
                    />
                  )}
                  </>
                )}
              </AuxiliaryPanelHost>
            </Box>
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

      <FollowMeInvitation
        presenterClientId={followMeInvitation?.clientId ?? null}
        presenterDisplayName={followMeInvitation?.displayName ?? null}
        presenterColorHex={followMeInvitation?.colorHex}
        onAccept={handleFollowMeAccept}
        onDismiss={() => setFollowMeInvitation(null)}
      />

      <Snackbar
        open={followMeEndedSnackbar}
        autoHideDuration={3000}
        onClose={() => setFollowMeEndedSnackbar(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={t('board.followMe.sessionEnded', 'Präsentation beendet')}
      />
    </Box>
  );
}
