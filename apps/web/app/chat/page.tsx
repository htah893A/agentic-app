import AgentChat from '@/app/ui/chat/agent-chat';

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">New chat</h1>
      <AgentChat />
    </div>
  );
}
