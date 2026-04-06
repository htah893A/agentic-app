'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChatHistory, fetchSessionList, sendChatMessage } from '@/app/lib/actions/chat';
import LanguageSelector from '@/app/ui/language/language-selector';
import VoiceRecorder from '@/app/ui/language/voice-recorder';
import ProgressDashboard from '@/app/ui/language/progress-dashboard';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

let msgCounter = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" role="status" aria-label="Agent is typing">
      <span className="sr-only">Agent is typing</span>
      {[0, 1, 2].map((i) => (
        <span key={i} className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
      ))}
    </div>
  );
}

function Message({
  role,
  content,
  isStreaming,
}: {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={`mb-4 flex animate-fadeSlideIn flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
        {isUser ? 'you' : '🎓 teacher'}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-chat-user text-white'
            : 'rounded-bl-sm border border-chat-border bg-chat-agent text-neutral-900 dark:text-neutral-100'
        }`}
      >
        {isStreaming ? <TypingDots /> : <span className="whitespace-pre-wrap break-words">{content}</span>}
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  selectedLanguage,
}: {
  onPick: (text: string) => void;
  selectedLanguage?: string;
}) {
  const langSuggestions = selectedLanguage
    ? [
        `I want to start learning ${selectedLanguage}`,
        `Teach me basic greetings in ${selectedLanguage}`,
        `Let's practice a conversation in ${selectedLanguage}`,
        `Review my vocabulary in ${selectedLanguage}`,
      ]
    : [
        'I want to learn a new language',
        'Help me practice my Spanish',
        'Teach me Japanese greetings',
        'I need help with French grammar',
      ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <div className="mx-auto mb-3 text-4xl">🌍</div>
        <p className="text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
          Your AI Language Teacher
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {selectedLanguage
            ? `Ready to help you learn ${selectedLanguage}!`
            : 'Pick a language above or tell me what you want to learn'}
        </p>
      </div>
      <div className="flex max-w-md flex-wrap justify-center gap-2" role="group" aria-label="Suggested prompts">
        {langSuggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`Use suggestion: ${s}`}
            className="rounded-full border border-chat-border bg-chat-bg px-3 py-1.5 text-xs text-neutral-600 transition hover:bg-chat-surface hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function unwrapDdb(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('S' in obj) return String(obj.S);
    if ('N' in obj) return String(obj.N);
  }
  return String(val);
}

function recordsToMessages(items: Record<string, unknown>[]): Msg[] {
  const out: Msg[] = [];
  for (const item of items) {
    const rawRole = unwrapDdb(item.role ?? item.sender).toLowerCase();
    const content =
      unwrapDdb(item.content) || unwrapDdb(item.message) || unwrapDdb(item.text) || unwrapDdb(item.body);
    if (!content.trim()) continue;
    const role: 'user' | 'assistant' = rawRole === 'user' || rawRole === 'human' ? 'user' : 'assistant';
    out.push({ id: nextMsgId(), role, content });
  }
  return out;
}

export default function AgentChat({ initialSessionId }: { initialSessionId?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [hydrated, setHydrated] = useState(!initialSessionId);
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>();
  const [voiceMode, setVoiceMode] = useState(false);

  // Progress state (extracted from agent responses)
  const [progress, setProgress] = useState<{
    level?: string;
    sessionsCount?: number;
    lastTopics?: string;
    dueReviews?: number;
  }>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const loadThread = useCallback(async (sid: string) => {
    setHydrated(false);
    try {
      const { history } = await fetchChatHistory(sid);
      let next = recordsToMessages(history);
      if (next.length === 0) {
        const { sessions } = await fetchSessionList();
        const s = sessions.find((x) => x.sessionId === sid);
        if (s?.lastMessage && s?.lastResponse) {
          next = [
            { id: nextMsgId(), role: 'user', content: s.lastMessage },
            { id: nextMsgId(), role: 'assistant', content: s.lastResponse },
          ];
        }
      }
      setMessages(next);
      setSessionId(sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chat');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (initialSessionId) {
      void loadThread(initialSessionId);
    }
  }, [initialSessionId, loadThread]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = async (overrideText?: string, audioBase64?: string) => {
    const text = overrideText ?? input.trim();
    if ((!text && !audioBase64) || isLoading) return;

    const userMsg: Msg = {
      id: nextMsgId(),
      role: 'user',
      content: audioBase64 ? '🎤 Voice message' : text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const res = await sendChatMessage(text || 'Voice message', sessionId, {
        audioBase64,
        language: selectedLanguage,
        mode: audioBase64 ? 'voice' : 'text',
      });
      setSessionId(res.sessionId);
      if (!initialSessionId && res.sessionId) {
        window.history.replaceState(null, '', `/chat/${encodeURIComponent(res.sessionId)}`);
      }
      setMessages((prev) => [...prev, { id: nextMsgId(), role: 'assistant', content: res.response }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    setInput('');
    setSessionId(undefined);
    setProgress({});
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    window.history.replaceState(null, '', '/chat');
  };

  const handleVoiceRecording = (audioBase64: string) => {
    void handleSend(undefined, audioBase64);
  };

  if (initialSessionId && !hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Loading conversation…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Language Selector */}
      <div className="rounded-xl border border-chat-border bg-chat-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Learning</span>
          <button
            type="button"
            onClick={() => setVoiceMode((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              voiceMode
                ? 'bg-chat-accent/10 text-chat-accent'
                : 'bg-chat-bg text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {voiceMode ? '🎤 Voice On' : '🔇 Voice Off'}
          </button>
        </div>
        <LanguageSelector selected={selectedLanguage} onSelect={setSelectedLanguage} />
      </div>

      {/* Progress Dashboard */}
      <ProgressDashboard
        language={selectedLanguage}
        level={progress.level}
        sessionsCount={progress.sessionsCount}
        lastTopics={progress.lastTopics}
        dueReviews={progress.dueReviews}
      />

      {/* Chat Window */}
      <div className="flex h-[min(560px,calc(100vh-20rem))] flex-col overflow-hidden rounded-xl border border-chat-border bg-chat-bg shadow-sm">
        <div className="flex items-center justify-between border-b border-chat-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${isLoading ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]' : 'bg-neutral-400'}`}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">🎓 Teacher</span>
            <span className="rounded bg-chat-surface px-1.5 py-0.5 font-mono text-[11px] text-neutral-500">
              {selectedLanguage || 'multi-lang'}
            </span>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear conversation"
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Clear
            </button>
          )}
        </div>

        <div id="agent-chat-messages" className="flex flex-1 flex-col overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && !isLoading ? (
            <EmptyState onPick={(s) => setInput(s)} selectedLanguage={selectedLanguage} />
          ) : (
            <>
              {messages.map((msg) => (
                <Message key={msg.id} role={msg.role} content={msg.content} />
              ))}
              {isLoading && <Message role="assistant" content="" isStreaming />}
              {error && (
                <div
                  role="alert"
                  className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-chat-border bg-chat-bg p-3">
          {voiceMode && (
            <VoiceRecorder onRecordingComplete={handleVoiceRecording} disabled={isLoading} />
          )}
          <textarea
            id="agent-chat-textarea"
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedLanguage
                ? `Practice ${selectedLanguage}… (Shift+Enter for new line)`
                : 'Message your teacher… (Shift+Enter for new line)'
            }
            disabled={isLoading}
            rows={1}
            className="max-h-40 min-h-[38px] flex-1 resize-none rounded-lg border border-chat-border bg-chat-bg px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white transition disabled:cursor-default disabled:bg-chat-surface disabled:text-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:disabled:bg-neutral-800"
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
