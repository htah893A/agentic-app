import ChatSideNav from '@/app/ui/chat/sidenav';

export const dynamic = 'force-dynamic';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row md:overflow-hidden">
      <div className="w-full flex-none md:w-56 md:shrink-0">
        <ChatSideNav />
      </div>
      <div className="grow overflow-y-auto p-4 md:p-8">{children}</div>
    </div>
  );
}
