/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Urbanist', 'Ucity Pro', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        'vf-primary': '#397DFF',
        'vf-primary-hover': '#2968e6',
        'vf-secondary': '#6B7280',
        'vf-background': '#f9fafb',
        'vf-surface': '#ffffff',
        'vf-border': '#e5e7eb',
      },
      borderRadius: {
        'vf': '12px',
        'vf-lg': '16px',
      },
      boxShadow: {
        'vf-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'vf': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'vf-lg': '0 4px 16px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
};
