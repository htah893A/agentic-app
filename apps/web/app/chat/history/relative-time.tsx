'use client';

export function RelativeTime({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp);
  return (
    <time
      className="shrink-0 font-mono text-xs text-neutral-500"
      dateTime={date.toISOString()}
      suppressHydrationWarning
    >
      {date.toLocaleString()}
    </time>
  );
}
