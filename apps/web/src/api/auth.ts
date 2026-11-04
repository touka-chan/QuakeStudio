import { ApiError, apiFetch } from './client';

export type ApiAdmin = {
  email: string;
  displayName: string;
};

export type ApiLogin = {
  admin: ApiAdmin;
  expiresAt: string;
};

export async function apiLogin(email: string, password: string): Promise<ApiLogin> {
  return apiFetch<ApiLogin>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiMe(): Promise<ApiLogin | null> {
  try {
    return await apiFetch<ApiLogin>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function apiLogout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}
