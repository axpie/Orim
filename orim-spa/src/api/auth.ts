import client from './client';
import type { AuthProvidersResponse, LoginResponse } from '../types/models';

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/login', { username, password });
  return data;
}

export async function refreshToken(): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/refresh');
  return data;
}

export async function logout(): Promise<void> {
  await client.post('/api/auth/logout');
}

export async function getAuthProviders(): Promise<AuthProvidersResponse> {
  const { data } = await client.get<AuthProvidersResponse>('/api/auth/providers');
  return data;
}

export async function exchangeMicrosoftIdToken(idToken: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/microsoft/exchange', { idToken });
  return data;
}

export async function exchangeGoogleIdToken(idToken: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/google/exchange', { idToken });
  return data;
}
