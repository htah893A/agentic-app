'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatBubbleLeftRightIcon, ClockIcon, HomeIcon } from '@heroicons/react/24/outline';
import { handleSignOut } from '@/app/lib/actions/auth';
import clsx from 'clsx';

const links = [
  { name: 'Chat', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'History', href: '/chat/history', icon: ClockIcon },
];

export default function ChatSideNav() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r border-chat-border bg-chat-surface px-3 py-4 md:w-56">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100"
      >
        <HomeIcon className="h-5 w-5" />
        Agentic
      </Link>
      <nav className="flex flex-col gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isChatActive =
            pathname === '/chat' ||
            (pathname.startsWith('/chat/') && !pathname.startsWith('/chat/history'));
          const isHistoryActive = pathname.startsWith('/chat/history');
          const isActive =
            link.href === '/chat/history' ? isHistoryActive : link.href === '/chat' ? isChatActive : false;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-neutral-200/80 text-neutral-900 dark:bg-neutral-700/80 dark:text-white'
                  : 'text-neutral-600 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50',
              )}
            >
              <Icon className="h-5 w-5" />
              {link.name}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <form action={handleSignOut}>
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
