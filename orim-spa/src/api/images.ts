import client from './client';
import type { UserImageInfo } from '../types/models';

/** Image IDs that were deleted in this browser session. Used for instant placeholder feedback. */
export const deletedImageIds = new Set<string>();

type Listener = () => void;
const deletedListeners = new Set<Listener>();

export function onImageDeleted(listener: Listener): () => void {
  deletedListeners.add(listener);
  return () => { deletedListeners.delete(listener); };
}

export async function uploadUserImage(file: File): Promise<UserImageInfo> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post<UserImageInfo>('/api/user-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getUserImages(): Promise<UserImageInfo[]> {
  const { data } = await client.get<UserImageInfo[]>('/api/user-images');
  return data;
}

export async function deleteUserImage(id: string): Promise<void> {
  await client.delete(`/api/user-images/${id}`);
  deletedImageIds.add(id);
  deletedListeners.forEach((l) => l());
}
