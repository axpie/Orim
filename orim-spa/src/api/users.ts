import client from './client';
import type { CreateUserRequest, User } from '../types/models';

export async function getUsers(): Promise<User[]> {
  const { data } = await client.get<User[]>('/api/users');
  return data;
}

export async function getUser(id: string): Promise<User> {
  const { data } = await client.get<User>(`/api/users/${id}`);
  return data;
}

export async function createUser(request: CreateUserRequest): Promise<User> {
  const { data } = await client.post<User>('/api/users', request);
  return data;
}

export async function changePassword(id: string, newPassword: string): Promise<void> {
  await client.put(`/api/users/${id}/password`, { newPassword });
}

export async function deactivateUser(id: string): Promise<void> {
  await client.put(`/api/users/${id}/deactivate`);
}

export async function deleteUser(id: string): Promise<void> {
  await client.delete(`/api/users/${id}`);
}
