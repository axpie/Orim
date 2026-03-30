import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  createBoardComment,
  createBoardCommentReply,
  deleteBoardComment,
  deleteBoardCommentReply,
} from '../../../api/comments';
import type {
  BoardComment,
  BoardCommentDeletedNotification,
  BoardCommentNotification,
} from '../../../types/models';
import { useBoardStore } from '../store/boardStore';

function getCommentErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: unknown };
      message?: string;
    };

    if (typeof candidate.response?.data === 'string' && candidate.response.data.trim().length > 0) {
      return candidate.response.data;
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return 'Comments could not be updated.';
}

export function useBoardComments(boardId: string | null) {
  const upsertComment = useBoardStore((state) => state.upsertComment);
  const removeComment = useBoardStore((state) => state.removeComment);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createCommentMutation = useMutation({
    mutationFn: async (variables: { x: number; y: number; text: string }) => {
      if (!boardId) {
        throw new Error('Board not loaded.');
      }

      return createBoardComment(boardId, variables.x, variables.y, variables.text);
    },
    onSuccess: (comment) => {
      upsertComment(comment);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(getCommentErrorMessage(error));
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: async (variables: { commentId: string; text: string }) => {
      if (!boardId) {
        throw new Error('Board not loaded.');
      }

      return createBoardCommentReply(boardId, variables.commentId, variables.text);
    },
    onSuccess: (comment) => {
      upsertComment(comment);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(getCommentErrorMessage(error));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!boardId) {
        throw new Error('Board not loaded.');
      }

      await deleteBoardComment(boardId, commentId);
      return commentId;
    },
    onSuccess: (commentId) => {
      removeComment(commentId);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(getCommentErrorMessage(error));
    },
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (variables: { commentId: string; replyId: string }) => {
      if (!boardId) {
        throw new Error('Board not loaded.');
      }

      return deleteBoardCommentReply(boardId, variables.commentId, variables.replyId);
    },
    onSuccess: (comment) => {
      upsertComment(comment);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(getCommentErrorMessage(error));
    },
  });

  const handleCommentUpserted = useCallback((notification: BoardCommentNotification) => {
    upsertComment(notification.comment);
    setErrorMessage(null);
  }, [upsertComment]);

  const handleCommentDeleted = useCallback((notification: BoardCommentDeletedNotification) => {
    removeComment(notification.commentId);
    setErrorMessage(null);
  }, [removeComment]);

  const clearErrorMessage = useCallback(() => setErrorMessage(null), []);

  const createCommentAt = useCallback(async (x: number, y: number, text: string): Promise<BoardComment> => {
    return createCommentMutation.mutateAsync({ x, y, text });
  }, [createCommentMutation]);

  const createReply = useCallback(async (commentId: string, text: string): Promise<BoardComment> => {
    return createReplyMutation.mutateAsync({ commentId, text });
  }, [createReplyMutation]);

  const removeBoardComment = useCallback(async (commentId: string): Promise<void> => {
    await deleteCommentMutation.mutateAsync(commentId);
  }, [deleteCommentMutation]);

  const removeBoardCommentReply = useCallback(async (commentId: string, replyId: string): Promise<BoardComment> => {
    return deleteReplyMutation.mutateAsync({ commentId, replyId });
  }, [deleteReplyMutation]);

  return {
    errorMessage,
    clearErrorMessage,
    handleCommentUpserted,
    handleCommentDeleted,
    createCommentAt,
    createReply,
    removeBoardComment,
    removeBoardCommentReply,
    isCreatingComment: createCommentMutation.isPending,
    isCreatingReply: createReplyMutation.isPending,
    deletingCommentId: deleteCommentMutation.isPending ? deleteCommentMutation.variables ?? null : null,
    deletingReply:
      deleteReplyMutation.isPending && deleteReplyMutation.variables
        ? deleteReplyMutation.variables
        : null,
  };
}
