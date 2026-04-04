import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Divider,
  IconButton,
  TextField,
  Typography,
  List,
  ListItem,
  CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { sendAssistantMessage } from '../../../api/boards';
import { useBoardStore } from '../store/boardStore';
import type { ChatMessageEntry } from '../../../types/models';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { AuxiliaryPanelShell } from './AuxiliaryPanelShell';

interface ChatPanelProps {
  boardId: string;
  onClose: () => void;
  onBoardChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  mobile?: boolean;
}

function getAssistantErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: unknown };
      message?: string;
    };

    if (typeof candidate.response?.data === 'string' && candidate.response.data.trim().length > 0) {
      return candidate.response.data;
    }

    if (typeof candidate.response?.data === 'object' && candidate.response.data !== null) {
      const payload = candidate.response.data as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error;
      }
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return 'Error communicating with assistant.';
}

export function ChatPanel({ boardId, onClose, onBoardChanged, mobile = false }: ChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessageEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const setBoard = useBoardStore((s) => s.setBoard);
  const setDirty = useBoardStore((s) => s.setDirty);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessageEntry = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await sendAssistantMessage(boardId, updatedMessages);

      if (response.board) {
        setBoard(response.board);
        setDirty(true);
        onBoardChanged?.('edit');
      }

      const toolActionSummary = (type: string): string | null => {
        switch (type) {
          case 'ElementAdded': return '🧰 Element added';
          case 'ElementUpdated': return '🧰 Element updated';
          case 'ElementRemoved': return '🧰 Element removed';
          case 'BoardCleared': return '🧰 Board cleared';
          default: return null;
        }
      };

      const lines = response.events
        .map((event) => {
          if (event.type === 'Message' || event.type === 'Error') return event.content;
          return toolActionSummary(event.type);
        })
        .filter((line): line is string => line !== null && line.length > 0);

      const assistantMsg: ChatMessageEntry = {
        role: 'assistant',
        content: lines.join('\n') || 'Done.',
      };
      setMessages([...updatedMessages, assistantMsg]);
    } catch (error) {
      const errorMsg: ChatMessageEntry = {
        role: 'assistant',
        content: getAssistantErrorMessage(error),
      };
      setMessages([...updatedMessages, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuxiliaryPanelShell title={t('assistant.title')} onClose={onClose} mobile={mobile}>
      <List
        ref={listRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1,
          py: 1,
        }}
      >
        {messages.length === 0 && (
          <ListItem>
            <Typography variant="body2" color="text.secondary">
              {t('assistant.emptyState')}
            </Typography>
          </ListItem>
        )}
        {messages.map((msg, i) => (
          <ListItem
            key={i}
            sx={{
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              px: 0,
            }}
          >
            <Box
              sx={{
                bgcolor: msg.role === 'user' ? 'primary.main' : 'action.hover',
                color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                borderRadius: 2,
                px: 1.5,
                py: 1,
                maxWidth: '85%',
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </Typography>
            </Box>
          </ListItem>
        ))}
        {loading && (
          <ListItem sx={{ justifyContent: 'flex-start' }}>
            <CircularProgress size={20} />
          </ListItem>
        )}
      </List>

      <Divider />
      <Box sx={{ display: 'flex', p: 1, gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={t('assistant.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          multiline
          maxRows={3}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </AuxiliaryPanelShell>
  );
}
