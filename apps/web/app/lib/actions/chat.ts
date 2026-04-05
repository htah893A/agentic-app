'use server';

import { apiFetch, AuthError } from '@/app/lib/api-client';
import { redirect } from 'next/navigation';

export type ChatInvokeResult = {
  response: string;
  sessionId: string;
  conversationId: string;
  timestamp: string;
};

export async function sendChatMessage(
  message: string,
  sessionId?: string,
): Promise<ChatInvokeResult> {
  try {
    return await apiFetch<ChatInvokeResult>('chat/invoke', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    });
  } catch (e) {
    if (e instanceof AuthError) redirect('/login');
    throw e;
  }
}

export async function fetchChatHistory(sessionId?: string) {
  const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  try {
    return await apiFetch<{ history: Record<string, unknown>[] }>(`chat/history${q}`);
  } catch (e) {
    if (e instanceof AuthError) redirect('/login');
    throw e;
  }
}

export type SessionItem = {
  sessionId: string;
  userId: string;
  lastMessage: string;
  lastResponse: string;
  timestamp: number;
  email?: string;
};

export async function fetchSessionList(): Promise<{ sessions: SessionItem[] }> {
  try {
    const data = await apiFetch<{ sessions: Record<string, unknown>[] }>('chat/history?list=sessions');
    const sessions = (data.sessions ?? []).map((item) => ({
      sessionId: ddb(item.sessionId),
      userId: ddb(item.userId),
      lastMessage: ddb(item.lastMessage),
      lastResponse: ddb(item.lastResponse),
      timestamp: Number(ddb(item.timestamp)) || 0,
      email: ddb(item.email) || undefined,
    }));
    return { sessions };
  } catch (e) {
    if (e instanceof AuthError) redirect('/login');
    throw e;
  }
}

function ddb(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('S' in obj) return String(obj.S);
    if ('N' in obj) return String(obj.N);
    if ('BOOL' in obj) return String(obj.BOOL);
    if ('NULL' in obj) return '';
  }
  return String(val);
}
