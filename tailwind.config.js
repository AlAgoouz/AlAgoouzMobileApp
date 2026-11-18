/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        espresso: {
          DEFAULT: 'var(--brand-espresso)',
          deep: 'var(--brand-espresso-deep)',
        },
        gold: {
          DEFAULT: 'var(--brand-gold)',
          soft: 'var(--brand-gold-soft)',
          tint: 'var(--brand-gold-tint)',
          edge: 'var(--brand-gold-edge)',
          highlight: 'var(--brand-gold-highlight)',
          shade: 'var(--brand-gold-shade)',
        },
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          sunken: 'var(--surface-sunken)',
          raised: 'var(--surface-raised)',
          control: 'var(--surface-control)',
        },
        ink: {
          strong: 'var(--ink-strong)',
          DEFAULT: 'var(--ink-default)',
          faint: 'var(--ink-faint)',
          'on-dark': 'var(--ink-on-dark)',
          'on-gold': 'var(--ink-on-gold)',
        },
        line: {
          subtle: 'var(--line-subtle)',
          DEFAULT: 'var(--line-default)',
          strong: 'var(--line-strong)',
          control: 'var(--line-control)',
        },
        status: {
          ok: 'var(--ok)',
          'ok-bg': 'var(--ok-bg)',
          'ok-line': 'var(--ok-line)',
          warn: 'var(--warn)',
          'warn-bg': 'var(--warn-bg)',
          'warn-line': 'var(--warn-line)',
          danger: 'var(--danger)',
          'danger-bg': 'var(--danger-bg)',
          'danger-line': 'var(--danger-line)',
          info: 'var(--info)',
          'info-bg': 'var(--info-bg)',
          'info-line': 'var(--info-line)',
        },
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'sh-1': 'var(--sh-1)',
        'sh-2': 'var(--sh-2)',
        'sh-3': 'var(--sh-3)',
      },
    },
  },
  plugins: [],
}
