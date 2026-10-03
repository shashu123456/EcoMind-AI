/** `/auth` — login, register, current user. The only anonymous-capable routes. */

import { request, setToken, setUser, clearSession } from './client';
import type { AuthPayload, User } from './types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}

/**
 * The session row is cached in localStorage as a `StoredUser`, whose
 * `full_name` is optional but never null. The server sends `full_name` as a
 * nullable column, so a user who registered without one produces `null` — and
 * `null` is not a string, so the cache type is honest about widening it here
 * rather than pretending the column cannot be empty.
 */
function cacheUser(user: User): void {
  setUser({
    ...user,
    full_name: user.full_name ?? undefined,
    role: user.role ?? undefined,
  });
}

export async function login(payload: LoginPayload): Promise<AuthPayload> {
  const result = await request<AuthPayload>('/auth/login', {
    method: 'POST',
    body: payload,
    anonymous: true,
  });
  setToken(result.access_token);
  cacheUser(result.user);
  return result;
}

export async function register(payload: RegisterPayload): Promise<AuthPayload> {
  const result = await request<AuthPayload>('/auth/register', {
    method: 'POST',
    body: payload,
    anonymous: true,
  });
  setToken(result.access_token);
  cacheUser(result.user);
  return result;
}

export async function me(): Promise<User> {
  return request<User>('/auth/me');
}

export function logout(): void {
  clearSession();
}
