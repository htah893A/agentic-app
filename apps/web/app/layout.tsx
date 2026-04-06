import '@/app/ui/global.css';
import { inter, jetbrainsMono } from '@/app/ui/fonts';

export const metadata = {
  title: 'LangTeacher — AI Language Learning',
  description: 'Personal AI language teacher with grammar, vocabulary, conversation practice, and voice training',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${jetbrainsMono.variable} antialiased bg-chat-bg text-neutral-900 dark:text-neutral-100`}>
        {children}
      </body>
    </html>
  );
}
