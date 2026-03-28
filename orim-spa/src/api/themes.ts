import client from './client';
import type { ThemeDefinition } from '../types/models';

export async function getThemes(): Promise<ThemeDefinition[]> {
  const { data } = await client.get<ThemeDefinition[]>('/api/themes');
  return data;
}