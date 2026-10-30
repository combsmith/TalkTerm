import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#EB8C00',
          light: '#FFB600',
          dark: '#D04A02',
        },
        accent: {
          rose: '#DB536A',
        },
        danger: '#E0301E',
        stage: {
          bg: '#1A1A1A',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#F5F5F5',
          muted: '#2A2A2A',
        },
        semantic: {
          success: '#2E7D32',
          warning: '#EB8C00',
          error: '#E0301E',
          info: '#1565C0',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#6B6B6B',
          'on-dark': '#F0F0F0',
          'muted-on-dark': '#A0A0A0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        title: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        subtitle: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        small: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
      },
      spacing: {
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
      },
      transitionTimingFunction: {
        'panel-slide': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      transitionDuration: {
        '200': '200ms',
        '100': '100ms',
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.2)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
