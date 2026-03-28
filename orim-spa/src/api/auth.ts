import client from './client';
import type { LoginResponse } from '../types/models';

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/login', { username, password });
  return data;
}

export async function refreshToken(): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/refresh');
  return data;
}
