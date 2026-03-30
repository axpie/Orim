import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddCommentIcon from '@mui/icons-material/AddComment';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SendIcon from '@mui/icons-material/Send';
import type { BoardComment } from '../../../types/models';

export const COMMENTS_PANEL_WIDTH = 360;

interface CommentsPanelProps {
  comments: BoardComment[];
  activeCommentId: string | null;
  pendingAnchor: { x: number; y: number } | null;
  canCreateComments: boolean;
  currentUserId?: string | null;
  boardOwnerId?: string | null;
  isCreatingComment?: boolean;
  isCreatingReply?: boolean;
  deletingCommentId?: string | null;
  deletingReply?: { commentId: string; replyId: string } | null;
  mobile?: boolean;
  onClose: () => void;
  onSelectComment: (commentId: string) => void;
  onStartComment: () => void;
  onCancelPendingComment: () => void;
  onCreateComment: (text: string) => Promise<void>;
  onCreateReply: (commentId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onDeleteReply: (commentId: string, replyId: string) => Promise<void>;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function CommentsPanel({
  comments,
  activeCommentId,
  pendingAnchor,
  canCreateComments,
  currentUserId = null,
  boardOwnerId = null,
  isCreatingComment = false,
  isCreatingReply = false,
  deletingCommentId = null,
  deletingReply = null,
  mobile = false,
  onClose,
  onSelectComment,
  onStartComment,
  onCancelPendingComment,
  onCreateComment,
  onCreateReply,
  onDeleteComment,
  onDeleteReply,
}: CommentsPanelProps) {
  const { t } = useTranslation();
  const [commentDraft, setCommentDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');

  const sortedComments = useMemo(
    () => [...comments].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [comments],
  );

  const activeComment = sortedComments.find((comment) => comment.id === activeCommentId) ?? sortedComments[0] ?? null;
  const activeReplies = activeComment
    ? [...activeComment.replies].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    : [];

  useEffect(() => {
    if (!pendingAnchor) {
      setCommentDraft('');
    }
  }, [pendingAnchor]);

  useEffect(() => {
    setReplyDraft('');
  }, [activeCommentId]);

  const canDeleteEntry = (authorUserId: string) =>
    !!currentUserId && (currentUserId === authorUserId || currentUserId === boardOwnerId);

  const handleCreateComment = async () => {
    const text = commentDraft.trim();
    if (!text) {
      return;
    }

    await onCreateComment(text);
    setCommentDraft('');
  };

  const handleCreateReply = async () => {
    if (!activeComment) {
      return;
    }

    const text = replyDraft.trim();
    if (!text) {
      return;
    }

    await onCreateReply(activeComment.id, text);
    setReplyDraft('');
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: mobile ? '100%' : COMMENTS_PANEL_WIDTH,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderLeft: mobile ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
        pt: mobile ? 'env(safe-area-inset-top)' : 0,
        pb: mobile ? 'env(safe-area-inset-bottom)' : 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
          {t('comments.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
          {comments.length}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1}>
          {canCreateComments && (
            <Button
              variant={pendingAnchor ? 'contained' : 'outlined'}
              startIcon={<AddCommentIcon />}
              onClick={onStartComment}
              fullWidth
            >
              {pendingAnchor ? t('comments.pickLocationActive') : t('comments.addComment')}
            </Button>
          )}
        </Stack>
        {!canCreateComments && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('comments.readOnlyHint')}
          </Typography>
        )}
      </Box>

      {pendingAnchor && (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('comments.newComment')}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {t('comments.anchorLocation', {
                x: Math.round(pendingAnchor.x),
                y: Math.round(pendingAnchor.y),
              })}
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
              placeholder={t('comments.commentPlaceholder')}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleCreateComment();
                }
              }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button onClick={onCancelPendingComment} disabled={isCreatingComment}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="contained"
                onClick={() => { void handleCreateComment(); }}
                disabled={isCreatingComment || !commentDraft.trim()}
                startIcon={isCreatingComment ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {t('comments.createComment')}
              </Button>
            </Stack>
          </Box>
        </>
      )}

      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {sortedComments.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {t('comments.emptyState')}
            </Typography>
          </Box>
        ) : (
          <>
            <List dense disablePadding>
              {sortedComments.map((comment) => (
                <ListItemButton
                  key={comment.id}
                  selected={comment.id === activeComment?.id}
                  onClick={() => onSelectComment(comment.id)}
                  sx={{ alignItems: 'flex-start', px: 2, py: 1.25 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="baseline">
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {comment.authorUsername}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {formatTimestamp(comment.updatedAt)}
                      </Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{
                        mt: 0.5,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                      }}
                    >
                      {comment.text}
                    </Typography>
                    {comment.replies.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {t('comments.replyCount', { count: comment.replies.length })}
                      </Typography>
                    )}
                  </Box>
                </ListItemButton>
              ))}
            </List>

            {activeComment && (
              <>
                <Divider />
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2">{activeComment.authorUsername}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        {formatTimestamp(activeComment.createdAt)}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {activeComment.text}
                      </Typography>
                    </Box>
                    {canDeleteEntry(activeComment.authorUserId) && (
                      <Tooltip title={t('comments.deleteComment')}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => { void onDeleteComment(activeComment.id); }}
                            disabled={deletingCommentId === activeComment.id}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>

                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    {t('comments.replies')}
                  </Typography>

                  <Stack spacing={1}>
                    {activeReplies.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {t('comments.noReplies')}
                      </Typography>
                    )}
                    {activeReplies.map((reply) => (
                      <Box
                        key={reply.id}
                        sx={{
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 2,
                          px: 1.5,
                          py: 1,
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {reply.authorUsername}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                              {formatTimestamp(reply.createdAt)}
                            </Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                              {reply.text}
                            </Typography>
                          </Box>
                          {canDeleteEntry(reply.authorUserId) && (
                            <Tooltip title={t('comments.deleteReply')}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => { void onDeleteReply(activeComment.id, reply.id); }}
                                  disabled={deletingReply?.commentId === activeComment.id && deletingReply.replyId === reply.id}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>

                  {canCreateComments && (
                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        maxRows={4}
                        placeholder={t('comments.replyPlaceholder')}
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            void handleCreateReply();
                          }
                        }}
                      />
                      <IconButton
                        color="primary"
                        onClick={() => { void handleCreateReply(); }}
                        disabled={isCreatingReply || !replyDraft.trim()}
                      >
                        {isCreatingReply ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                      </IconButton>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}
