import client from './client';
import type { BoardComment } from '../types/models';

export async function getBoardComments(boardId: string): Promise<BoardComment[]> {
  const { data } = await client.get<BoardComment[]>(`/api/boards/${boardId}/comments`);
  return data;
}

export async function createBoardComment(
  boardId: string,
  x: number,
  y: number,
  text: string,
): Promise<BoardComment> {
  const { data } = await client.post<BoardComment>(`/api/boards/${boardId}/comments`, { x, y, text });
  return data;
}

export async function createBoardCommentReply(
  boardId: string,
  commentId: string,
  text: string,
): Promise<BoardComment> {
  const { data } = await client.post<BoardComment>(`/api/boards/${boardId}/comments/${commentId}/replies`, { text });
  return data;
}

export async function deleteBoardComment(boardId: string, commentId: string): Promise<void> {
  await client.delete(`/api/boards/${boardId}/comments/${commentId}`);
}

export async function deleteBoardCommentReply(
  boardId: string,
  commentId: string,
  replyId: string,
): Promise<BoardComment> {
  const { data } = await client.delete<BoardComment>(`/api/boards/${boardId}/comments/${commentId}/replies/${replyId}`);
  return data;
}
