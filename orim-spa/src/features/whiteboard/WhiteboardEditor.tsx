import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { getAssistantAvailability } from '../../api/assistantSettings';
import { getBoard, updateBoard } from '../../api/boards';
import { useBoardStore } from './store/boardStore';
import { useCommandStack } from './store/commandStack';
import { useSignalR } from '../../hooks/useSignalR';
import { WhiteboardCanvas } from './canvas/WhiteboardCanvas';
import { Toolbar } from './tools/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ChatPanel } from './panels/ChatPanel';
import { BoardTopBar } from './tools/BoardTopBar';
import type { Board } from '../../types/models';
import { BoardRole } from '../../types/models';
import { useAuthStore } from '../../stores/authStore';

const PROPERTIES_PANEL_WIDTH = 280;
const CHAT_PANEL_WIDTH = 320;

export function WhiteboardEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isNarrowPanelMode = useMediaQuery(theme.breakpoints.down('sm'));
  const setBoard = useBoardStore((s) => s.setBoard);
  const setRemoteCursors = useBoardStore((s) => s.setRemoteCursors);
  const setViewportInsets = useBoardStore((s) => s.setViewportInsets);
  const user = useAuthStore((s) => s.user);
  const board = useBoardStore((s) => s.board);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const isDirty = useBoardStore((s) => s.isDirty);
  const setDirty = useBoardStore((s) => s.setDirty);
  const clearCommandStack = useCommandStack((s) => s.clear);

  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileOverlayOpen = isNarrowPanelMode && (propertiesOpen || chatOpen);

  const currentMembership = user && board
    ? board.members.find((member) => member.userId === user.id) ?? (board.ownerId === user.id
      ? { userId: user.id, username: user.username, role: BoardRole.Owner }
      : null)
    : null;
  const canEdit = currentMembership != null && currentMembership.role !== BoardRole.Viewer;
  const canShare = currentMembership?.role === BoardRole.Owner;

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
      setBoard(data as Board);
      setRemoteCursors([]);
      clearCommandStack();
    }
  }, [data, setBoard, setRemoteCursors, clearCommandStack]);

  useEffect(() => {
    if (isError) navigate('/');
  }, [isError, navigate]);

  const saveMutation = useMutation({
    mutationFn: (b: Partial<Board>) => updateBoard(id!, b),
    onSuccess: () => setDirty(false),
  });

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = useBoardStore.getState().board;
      if (current) {
        saveMutation.mutate({
          title: current.title,
          elements: current.elements,
        });
      }
    }, 1500);
  }, [saveMutation]);

  useEffect(() => {
    if (isDirty) scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, scheduleSave]);

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
      right: (chatOpen ? CHAT_PANEL_WIDTH : 0) + (propertiesOpen ? PROPERTIES_PANEL_WIDTH : 0),
      bottom: 0,
      left: 0,
    });
  }, [canEdit, chatOpen, isNarrowPanelMode, propertiesOpen, setViewportInsets]);

  const { sendBoardState, sendBoardStateThrottled, sendCursorUpdate, connectionId } = useSignalR({
    boardId: id ?? null,
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

  const onBoardChanged = useCallback(
    (changeKind: string) => {
      if (!canEdit) {
        return;
      }

      setDirty(true);
      const current = useBoardStore.getState().board;
      if (current) {
        sendBoardState(current, changeKind);
      }
    },
    [canEdit, setDirty, sendBoardState],
  );

  const onBoardLiveChanged = useCallback(
    (changeKind: string) => {
      if (!canEdit) {
        return;
      }

      const current = useBoardStore.getState().board;
      if (current) {
        sendBoardStateThrottled(current, changeKind);
      }
    },
    [canEdit, sendBoardStateThrottled],
  );

  if (!board) return null;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' }}>
      <BoardTopBar
        onOpenProperties={openPropertiesPanel}
        onOpenChat={openChatPanel}
        propertiesOpen={propertiesOpen}
        chatOpen={chatOpen}
        saving={saveMutation.isPending}
        titleEditable={canEdit}
        showShare={canShare}
        showProperties={canEdit}
        showChat={canUseAssistant}
        collaborators={remoteCursors}
        localConnectionId={connectionId}
      />
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {canEdit && !mobileOverlayOpen && <Toolbar />}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <WhiteboardCanvas
            editable={canEdit}
            localPresenceClientId={connectionId}
            onBoardChanged={onBoardChanged}
            onBoardLiveChanged={onBoardLiveChanged}
            onPointerPresenceChanged={sendCursorUpdate}
          />

          {canEdit && !isNarrowPanelMode && chatOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: propertiesOpen ? `${PROPERTIES_PANEL_WIDTH}px` : 0,
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
    </Box>
  );
}
