import Link from 'next/link';
import { ArrowRightIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { handleSignIn } from '@/app/lib/actions/auth';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-chat-border bg-chat-surface">
          <ChatBubbleLeftRightIcon className="h-8 w-8 text-chat-accent" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Agentic</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Chat with your agent, review past conversations, and pick up where you left off.
        </p>
        <form action={handleSignIn} className="mt-10">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Sign in with Cognito
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
        <p className="mt-8 text-sm text-neutral-500">
          Already signed in?{' '}
          <Link href="/chat" className="font-medium text-chat-accent underline-offset-4 hover:underline">
            Open chat
          </Link>
        </p>
      </div>
    </main>
  );
}
