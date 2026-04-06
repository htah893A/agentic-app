'use client';

type ProgressDashboardProps = {
  language?: string;
  level?: string;
  sessionsCount?: number;
  lastTopics?: string;
  dueReviews?: number;
};

export default function ProgressDashboard({
  language,
  level,
  sessionsCount,
  lastTopics,
  dueReviews,
}: ProgressDashboardProps) {
  if (!language) return null;

  const levelColors: Record<string, string> = {
    beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    advanced: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <div className="rounded-xl border border-chat-border bg-chat-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Your Progress</h3>
        {level && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${levelColors[level] || levelColors.beginner}`}>
            {level}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{sessionsCount ?? 0}</div>
          <div className="text-[11px] text-neutral-500">Sessions</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-chat-accent">{dueReviews ?? 0}</div>
          <div className="text-[11px] text-neutral-500">Due Reviews</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{language}</div>
          <div className="text-[11px] text-neutral-500">Language</div>
        </div>
      </div>

      {lastTopics && (
        <div className="mt-3 border-t border-chat-border pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Last session</div>
          <div className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">{lastTopics}</div>
        </div>
      )}
    </div>
  );
}
