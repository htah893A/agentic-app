import AgentChat from '@/app/ui/chat/agent-chat';

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const decoded = decodeURIComponent(sessionId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Conversation</h1>
      <AgentChat initialSessionId={decoded} />
    </div>
  );
}
