/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          50: 'var(--gray-50)', 100: 'var(--gray-100)', 200: 'var(--gray-200)', 300: 'var(--gray-300)',
          400: 'var(--gray-400)', 500: 'var(--gray-500)', 600: 'var(--gray-600)', 700: 'var(--gray-700)',
          800: 'var(--gray-800)', 900: 'var(--gray-900)',
        },
        dark: {
          DEFAULT: 'var(--bg)', 50: 'var(--bg)',
          100: 'var(--bg2)', 200: 'var(--bg2)', 300: 'var(--bg3)',
        },
        surface: {
          DEFAULT: 'var(--panel)', light: 'var(--panel2)', lighter: 'var(--panel3)', dark: 'var(--bg)',
        },
        // Brand — royal suite (deep indigo-blue identity, gold highlights).
        primary: {
          DEFAULT: '#4C5FD5',
          50: '#EEF1FD', 100: '#DCE3FB', 200: '#B9C6F6', 300: '#8FA0EE',
          400: '#6B7EE5', 500: '#4C5FD5', 600: '#3B4CBE', 700: '#2F3C99',
          800: '#27307A', 900: '#1F2660',
        },
        accent: {
          emerald: '#5B6FE0',
          cyan: '#4A9FD8',
          gold: '#D8A648',
          amber: '#D8A648',
          rose: '#C2335A',
          violet: '#8D7BD8',
        },
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        glass: '18px',
        card: '14px',
        button: '9px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
