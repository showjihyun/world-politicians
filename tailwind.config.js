/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05070f',
          900: '#0a0e1a',
          850: '#0d1322',
          800: '#111827',
        },
        gop: '#ef4444',
        dem: '#3b82f6',
        ind: '#a78bfa',
        ally: '#34d399',
        feud: '#fb7185',
        bridge: '#fbbf24',
        family: '#c084fc',
        mentor: '#94a3b8',
      },
      fontFamily: {
        sans: ['Pretendard', 'Pretendard Variable', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
