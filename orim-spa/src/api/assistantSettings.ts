import client from './client';
import type {
  AssistantAdminSettings,
  AssistantAvailability,
  AssistantSettingsUpdateRequest,
} from '../types/models';

export async function getAssistantAvailability(): Promise<AssistantAvailability> {
  const { data } = await client.get<AssistantAvailability>('/api/assistant/status');
  return data;
}

export async function getAssistantSettings(): Promise<AssistantAdminSettings> {
  const { data } = await client.get<AssistantAdminSettings>('/api/admin/assistant-settings');
  return data;
}

export async function updateAssistantSettings(
  request: AssistantSettingsUpdateRequest,
): Promise<AssistantAdminSettings> {
  const { data } = await client.put<AssistantAdminSettings>('/api/admin/assistant-settings', request);
  return data;
}