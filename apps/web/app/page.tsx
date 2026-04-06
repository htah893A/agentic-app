import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { handleSignIn } from '@/app/lib/actions/auth';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 text-5xl">🌍</div>
        <h1 className="text-3xl font-semibold tracking-tight">LangTeacher</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Your personal AI language teacher. Learn Spanish, French, Japanese, and more
          with grammar lessons, vocabulary drills, conversation practice, and voice training.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-2xl">
          <span>🇪🇸</span><span>🇫🇷</span><span>🇩🇪</span><span>🇮🇹</span><span>🇧🇷</span>
          <span>🇯🇵</span><span>🇰🇷</span><span>🇨🇳</span><span>🇸🇦</span><span>🇮🇳</span>
        </div>
        <form action={handleSignIn} className="mt-10">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Start Learning
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
        <p className="mt-8 text-sm text-neutral-500">
          Already have an account?{' '}
          <Link href="/chat" className="font-medium text-chat-accent underline-offset-4 hover:underline">
            Continue learning
          </Link>
        </p>
      </div>
    </main>
  );
}
