import Link from 'next/link';
import { fetchSessionList } from '@/app/lib/actions/chat';
import { RelativeTime } from './relative-time';

export const dynamic = 'force-dynamic';

export default async function ChatHistoryPage() {
  let sessions: {
    sessionId: string;
    lastMessage: string;
    lastResponse: string;
    timestamp: number;
  }[] = [];
  let error: string | null = null;

  try {
    const data = await fetchSessionList();
    sessions = data.sessions ?? [];
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    error = e instanceof Error ? e.message : 'Could not load sessions';
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Previous chats</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Open a session to continue the thread. New messages use the same session on the agent side.
      </p>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">No conversations yet. Start a chat from the Chat tab.</p>
      ) : (
        <ul className="divide-y divide-chat-border rounded-xl border border-chat-border bg-chat-bg">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <Link
                href={`/chat/${encodeURIComponent(s.sessionId)}`}
                className="block px-4 py-4 transition hover:bg-chat-surface"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {s.lastMessage || 'Conversation'}
                  </p>
                  {s.timestamp > 0 && <RelativeTime timestamp={s.timestamp} />}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{s.lastResponse}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
