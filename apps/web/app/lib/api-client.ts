import { auth } from '@/auth';
import { env } from '@/app/lib/env';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();

  if (!session?.idToken) {
    throw new AuthError('Not authenticated');
  }

  if (session.error === 'RefreshTokenError' || session.error === 'RefreshTokenMissing') {
    throw new AuthError('Session expired');
  }

  const url = `${env().API_ENDPOINT}${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: session.idToken,
      ...init?.headers,
    },
    cache: init?.cache ?? 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}
