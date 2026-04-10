import client from './client';
import type { BoardFileInfo } from '../types/models';

/** File IDs that were deleted in this browser session. Used for instant placeholder feedback. */
export const deletedFileIds = new Set<string>();

type Listener = () => void;
const deletedListeners = new Set<Listener>();

export function onFileDeleted(listener: Listener): () => void {
  deletedListeners.add(listener);
  return () => { deletedListeners.delete(listener); };
}

export async function uploadBoardFile(boardId: string, file: File): Promise<BoardFileInfo> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post<BoardFileInfo>(`/api/boards/${boardId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getBoardFiles(boardId: string): Promise<BoardFileInfo[]> {
  const { data } = await client.get<BoardFileInfo[]>(`/api/boards/${boardId}/files`);
  return data;
}

export async function deleteBoardFile(boardId: string, fileId: string): Promise<void> {
  await client.delete(`/api/boards/${boardId}/files/${fileId}`);
  deletedFileIds.add(fileId);
  deletedListeners.forEach((l) => l());
}

export async function uploadSharedBoardFile(token: string, password: string | null, file: File): Promise<BoardFileInfo> {
  const formData = new FormData();
  formData.append('file', file);
  if (password) formData.append('password', password);
  const { data } = await client.post<BoardFileInfo>(`/api/boards/shared/${token}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getSharedBoardFiles(token: string, password: string | null): Promise<BoardFileInfo[]> {
  const params = password ? { password } : {};
  const { data } = await client.get<BoardFileInfo[]>(`/api/boards/shared/${token}/files`, { params });
  return data;
}
