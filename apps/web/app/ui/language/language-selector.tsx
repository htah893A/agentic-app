'use client';

const LANGUAGES = [
  { name: 'Spanish', flag: '🇪🇸', code: 'es' },
  { name: 'French', flag: '🇫🇷', code: 'fr' },
  { name: 'German', flag: '🇩🇪', code: 'de' },
  { name: 'Italian', flag: '🇮🇹', code: 'it' },
  { name: 'Portuguese', flag: '🇧🇷', code: 'pt' },
  { name: 'Japanese', flag: '🇯🇵', code: 'ja' },
  { name: 'Korean', flag: '🇰🇷', code: 'ko' },
  { name: 'Mandarin Chinese', flag: '🇨🇳', code: 'zh' },
  { name: 'Arabic', flag: '🇸🇦', code: 'ar' },
  { name: 'Hindi', flag: '🇮🇳', code: 'hi' },
] as const;

export type SupportedLanguage = (typeof LANGUAGES)[number]['name'];

export default function LanguageSelector({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect: (language: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select a language to learn">
      {LANGUAGES.map((lang) => {
        const isActive = selected === lang.name;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(lang.name)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? 'border-chat-accent bg-chat-accent/10 text-chat-accent'
                : 'border-chat-border bg-chat-bg text-neutral-600 hover:bg-chat-surface dark:text-neutral-400'
            }`}
          >
            <span className="text-sm">{lang.flag}</span>
            {lang.name}
          </button>
        );
      })}
    </div>
  );
}

export { LANGUAGES };
