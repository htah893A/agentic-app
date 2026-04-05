import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chat: {
          bg: 'var(--chat-bg)',
          surface: 'var(--chat-surface)',
          border: 'var(--chat-border)',
          muted: 'var(--chat-muted)',
          accent: 'var(--chat-accent)',
          user: 'var(--chat-user-bg)',
          agent: 'var(--chat-agent-bg)',
        },
      },
      keyframes: {
        fadeSlideIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeSlideIn: 'fadeSlideIn 0.2s ease-out',
        'pulse-dot': 'pulse 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
export default config;
