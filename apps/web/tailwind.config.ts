import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#080d17' },
        accent: { 50: '#edfcf8', 100: '#d3f8ee', 300: '#5fe1c2', 400: '#2fc8aa', 500: '#16a98e', 600: '#0d8875', 700: '#0d6d60' },
      },
      boxShadow: { card: '0 12px 36px -20px rgb(15 23 42 / 0.24)' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config
