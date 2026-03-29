import client from './client';
import type { ThemeDefinition } from '../types/models';

export async function getThemes(): Promise<ThemeDefinition[]> {
  const { data } = await client.get<ThemeDefinition[]>('/api/themes');
  return data;
}

export async function getAdminThemes(): Promise<ThemeDefinition[]> {
  const { data } = await client.get<ThemeDefinition[]>('/api/admin/themes');
  return data;
}

export async function uploadTheme(file: File): Promise<ThemeDefinition> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post<ThemeDefinition>('/api/admin/themes/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function setThemeEnabled(key: string, enabled: boolean): Promise<void> {
  await client.put(`/api/admin/themes/${encodeURIComponent(key)}/enabled`, { enabled });
}

export async function deleteTheme(key: string): Promise<void> {
  await client.delete(`/api/admin/themes/${encodeURIComponent(key)}`);
}

export async function downloadThemeJson(key: string): Promise<Blob> {
  const { data } = await client.get(`/api/admin/themes/${encodeURIComponent(key)}/export`, {
    responseType: 'blob',
  });
  return data;
}