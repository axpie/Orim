import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Divider,
  IconButton,
  Paper,
  TextField,
  Typography,
  List,
  ListItem,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { sendAssistantMessage } from '../../../api/boards';
import { useBoardStore } from '../store/boardStore';
import type { ChatMessageEntry } from '../../../types/models';

interface ChatPanelProps {
  boardId: string;
  onClose: () => void;
  onBoardChanged?: (changeKind: string) => void;
}

export function ChatPanel({ boardId, onClose, onBoardChanged }: ChatPanelProps) {
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

      const assistantMsg: ChatMessageEntry = {
        role: 'assistant',
        content: response.events.map((event) => event.content).join('\n') || 'Done.',
      };
      setMessages([...updatedMessages, assistantMsg]);
    } catch {
      const errorMsg: ChatMessageEntry = {
        role: 'assistant',
        content: 'Error communicating with assistant.',
      };
      setMessages([...updatedMessages, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: 320,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderLeft: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
          {t('assistant.title')}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

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
    </Paper>
  );
}
