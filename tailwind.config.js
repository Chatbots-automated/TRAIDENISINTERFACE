/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Urbanist', 'sans-serif'],
      },
      colors: {
        // macOS System Colors
        'macos-blue': '#007AFF',
        'macos-blue-hover': '#0056CC',
        'macos-purple': '#AF52DE',
        'macos-pink': '#FF2D55',
        'macos-red': '#FF3B30',
        'macos-orange': '#FF9500',
        'macos-yellow': '#FFCC00',
        'macos-green': '#34C759',
        'macos-teal': '#5AC8FA',
        'macos-indigo': '#5856D6',
        // macOS Gray Scale
        'macos-gray': {
          50: '#F5F5F7',
          100: '#E8E8ED',
          200: '#D2D2D7',
          300: '#AEAEB2',
          400: '#8E8E93',
          500: '#6E6E73',
          600: '#48484A',
          700: '#3A3A3C',
          800: '#2C2C2E',
          900: '#1D1D1F',
        },
        // Legacy vf colors (mapped to macOS)
        'vf-primary': '#007AFF',
        'vf-primary-hover': '#0056CC',
        'vf-secondary': '#6E6E73',
        'vf-background': '#F5F5F7',
        'vf-surface': '#ffffff',
        'vf-border': '#D2D2D7',
      },
      borderRadius: {
        'vf': '10px',
        'vf-lg': '14px',
        'macos': '10px',
        'macos-lg': '14px',
        'macos-xl': '18px',
      },
      borderWidth: {
        'macos': '0.5px',
      },
      boxShadow: {
        // macOS-style shadows (softer, more diffused)
        'macos-sm': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'macos': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'macos-lg': '0 10px 25px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        'macos-xl': '0 20px 40px -4px rgba(0, 0, 0, 0.1), 0 8px 16px -4px rgba(0, 0, 0, 0.04)',
        'macos-window': '0 22px 70px 4px rgba(0, 0, 0, 0.2)',
        'macos-button': '0 1px 2px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'macos-inset': 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
        // Legacy shadows (updated to macOS style)
        'vf-sm': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'vf': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'vf-lg': '0 10px 25px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
      },
      letterSpacing: {
        'macos-tight': '-0.01em',
        'macos-tighter': '-0.02em',
      },
      backdropBlur: {
        'macos': '20px',
        'macos-lg': '40px',
      },
      backdropSaturate: {
        'macos': '1.8',
      },
    },
  },
  plugins: [],
};
