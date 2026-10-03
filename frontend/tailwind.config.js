/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // One neutral ramp drives all chrome, so hierarchy comes from space
        // and type weight rather than from competing palettes.
        neutral: {
          0: 'var(--surface)',
          50: 'var(--surface-inset)',
          100: 'var(--surface-2)',
          200: 'var(--surface-3)',
          300: 'var(--line)',
          400: 'var(--line-strong)',
          500: 'var(--ink-faint)',
          600: 'var(--ink-low)',
          700: 'var(--ink-mid)',
          800: 'var(--ink)',
          900: 'var(--ink)',
        },
        // Five semantic colours. Everything the user must react to maps to
        // exactly one of these.
        ok: {
          DEFAULT: 'var(--ok)',
          tint: 'var(--ok-tint)',
          line: 'var(--ok-line)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          tint: 'var(--warn-tint)',
          line: 'var(--warn-line)',
        },
        critical: {
          DEFAULT: 'var(--critical)',
          tint: 'var(--critical-tint)',
          line: 'var(--critical-line)',
        },
        info: {
          DEFAULT: 'var(--info)',
          tint: 'var(--info-tint)',
          line: 'var(--info-line)',
        },
        muted: {
          DEFAULT: 'var(--neutral)',
          tint: 'var(--neutral-tint)',
          line: 'var(--neutral-line)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          active: 'var(--brand-active)',
          tint: 'var(--brand-tint)',
          'tint-strong': 'var(--brand-tint-strong)',
          ink: 'var(--brand-ink)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Cascadia Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: '1rem' }],
        xs: ['var(--text-xs)', { lineHeight: '1.125rem' }],
        sm: ['var(--text-sm)', { lineHeight: '1.25rem' }],
        base: ['var(--text-base)', { lineHeight: '1.375rem' }],
        md: ['var(--text-md)', { lineHeight: '1.5rem' }],
        lg: ['var(--text-lg)', { lineHeight: '1.75rem' }],
        xl: ['var(--text-xl)', { lineHeight: '1.875rem' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '2.125rem' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '2.5rem' }],
        '4xl': ['var(--text-4xl)', { lineHeight: '3rem' }],
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        DEFAULT: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        overlay: 'var(--shadow-overlay)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        out: 'var(--ease-out)',
      },
      animation: {
        // The only animation in the system. It reveals a Data Quality
        // pipeline stage as that stage completes — real process state, not
        // decoration. Honours prefers-reduced-motion.
        'pipeline-reveal': 'pipeline-reveal var(--dur-base) var(--ease-out)',
      },
      keyframes: {
        'pipeline-reveal': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
