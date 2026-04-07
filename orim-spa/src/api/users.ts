import client from './client';
import type { CreateUserRequest, UpdateProfileRequest, UpdateUserRequest, User } from '../types/models';

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

export async function updateProfile(id: string, request: UpdateProfileRequest): Promise<User> {
  const { data } = await client.put<User>(`/api/users/${id}/profile`, request);
  return data;
}

export async function updateUser(id: string, request: UpdateUserRequest): Promise<User> {
  const { data } = await client.put<User>(`/api/users/${id}`, request);
  return data;
}

export async function changePassword(id: string, newPassword: string, currentPassword?: string): Promise<void> {
  await client.put(`/api/users/${id}/password`, { currentPassword, newPassword });
}

export async function deactivateUser(id: string): Promise<void> {
  await client.put(`/api/users/${id}/deactivate`);
}

export async function activateUser(id: string): Promise<void> {
  await client.put(`/api/users/${id}/activate`);
}

export async function deleteUser(id: string): Promise<void> {
  await client.delete(`/api/users/${id}`);
}
