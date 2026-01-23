/**
 * Design System - Claude Anthropic Inspired
 * Based on the Nestandartiniai Projektai tab design
 */

// Primary color palette - warm browns and beiges
export const colors = {
  // Backgrounds
  bg: {
    primary: '#fdfcfb',      // Very light cream - main background
    secondary: '#faf9f7',    // Light beige - cards, highlights
    white: '#ffffff',        // Pure white - cards
  },

  // Borders
  border: {
    light: '#f0ede8',        // Very light border
    default: '#e8e5e0',      // Default border color
    active: '#5a5550',       // Active/selected state
  },

  // Text colors
  text: {
    primary: '#3d3935',      // Dark brown - headers, primary text
    secondary: '#5a5550',    // Medium brown - labels, secondary text
    tertiary: '#8a857f',     // Light brown - placeholder, disabled
  },

  // Interactive elements
  interactive: {
    // Buttons
    buttonActiveBg: '#3d3935',
    buttonActiveText: '#ffffff',
    buttonInactiveBg: '#e8e5e0',
    buttonInactiveText: '#8a857f',
    buttonHoverBg: '#faf9f7',

    // Green accent for primary actions
    accent: '#556b50',        // Muted forest green with brown undertones
    accentHover: '#4a5f45',   // Darker green for hover
    accentLight: '#e8f0e6',   // Light green for backgrounds
  },

  // Icon backgrounds
  icon: {
    default: '#f0ede8',
    active: '#5a5550',
  },

  // Status colors
  status: {
    success: '#f0fdf4',
    successBorder: '#bbf7d0',
    successText: '#166534',
    error: '#fef2f2',
    errorBorder: '#fecaca',
    errorText: '#991b1b',
    info: '#faf9f7',
    infoBorder: '#e8e5e0',
  }
} as const;

// Typography
export const typography = {
  sizes: {
    xs: 'text-xs',       // 12px
    sm: 'text-sm',       // 14px
    base: 'text-base',   // 16px
    lg: 'text-lg',       // 18px
    xl: 'text-xl',       // 20px
  },
  weights: {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
  }
} as const;

// Spacing
export const spacing = {
  card: {
    padding: 'p-5',
    gap: 'gap-4',
  },
  section: {
    padding: 'px-6 py-6',
  }
} as const;

// Border radius
export const radius = {
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-xl',
} as const;

// Component styles
export const components = {
  card: {
    base: `rounded-xl border-2 transition-all duration-300`,
    default: {
      borderColor: colors.border.default,
      background: colors.bg.white,
    },
    selected: {
      borderColor: colors.border.active,
      background: colors.bg.secondary,
    },
  },

  button: {
    base: `py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed`,
    primary: {
      // Using green accent for primary actions
      background: colors.interactive.accent,
      backgroundHover: colors.interactive.accentHover,
      color: colors.text.primary,
    },
    secondary: {
      background: colors.interactive.buttonActiveBg,
      backgroundHover: '#2d2925',
      color: colors.interactive.buttonActiveText,
    },
    tertiary: {
      background: colors.interactive.buttonInactiveBg,
      color: colors.interactive.buttonInactiveText,
    },
  },

  input: {
    base: `w-full py-3 text-sm border rounded-lg`,
    style: {
      borderColor: colors.border.default,
      background: colors.bg.white,
      color: colors.text.primary,
    },
  },

  infoBox: {
    style: {
      background: colors.status.info,
      border: `1px solid ${colors.border.default}`,
      color: colors.text.secondary,
    },
  },
} as const;

// Helper function to create inline styles
export const createStyles = {
  card: (selected: boolean = false) => ({
    borderColor: selected ? colors.border.active : colors.border.default,
    background: selected ? colors.bg.secondary : colors.bg.white,
  }),

  iconBox: (active: boolean = false) => ({
    background: active ? colors.icon.active : colors.icon.default,
  }),

  button: {
    primary: () => ({
      background: colors.interactive.accent,
      color: '#ffffff',
    }),
    secondary: (active: boolean = true) => ({
      background: active ? colors.interactive.buttonActiveBg : colors.interactive.buttonInactiveBg,
      color: active ? colors.interactive.buttonActiveText : colors.interactive.buttonInactiveText,
    }),
  },
} as const;
