/**
 * Unified Design System
 * Professional warm palette with teal/green/blue accents
 */

// Core color palette - warm beige/brown base with vibrant accents
export const colors = {
  // Backgrounds - warm cream/beige tones
  bg: {
    primary: '#fdfcfb',      // Very light warm cream - main background (EVERYWHERE)
    secondary: '#faf9f7',    // Light beige - cards, highlights
    white: '#ffffff',        // Pure white - cards, modals
    tertiary: '#f5f3f0',     // Slightly darker beige - hover states
  },

  // Borders - beige tones only
  border: {
    light: '#f0ede8',        // Very light border
    default: '#e8e5e0',      // Default border color (PRIMARY BORDER)
    medium: '#d4cfc8',       // Medium border for emphasis
    dark: '#5a5550',         // Dark border for selected/active states
  },

  // Text colors - brown-gray hierarchy
  text: {
    primary: '#3d3935',      // Dark brown-gray - headers, primary text
    secondary: '#5a5550',    // Medium brown - labels, important secondary
    tertiary: '#8a857f',     // Light brown-gray - descriptions, less important
    quaternary: '#9ca3af',   // Light gray - placeholders, disabled text
  },

  // Accent colors - USE SPARINGLY, only for emphasis
  accent: {
    // Teal - primary interactive accent (loaders, progress, hover glows)
    teal: 'rgb(81, 228, 220)',
    tealLight: 'rgba(81, 228, 220, 0.1)',
    tealMedium: 'rgba(81, 228, 220, 0.3)',
    tealStrong: 'rgba(81, 228, 220, 0.5)',

    // Green - success states only
    green: '#10b981',
    greenLight: '#d1fae5',
    greenDark: '#065f46',
    greenBg: '#f0fdf4',
    greenBorder: '#bbf7d0',

    // Blue - info, links
    blue: '#3b82f6',
    blueLight: '#dbeafe',
    blueDark: '#1e40af',
    blueBg: '#eff6ff',
    blueBorder: '#bfdbfe',

    // Red - errors only
    red: '#ef4444',
    redLight: '#fee2e2',
    redDark: '#991b1b',
    redBg: '#fef2f2',
    redBorder: '#fecaca',

    // Orange - warnings only
    orange: '#f59e0b',
    orangeLight: '#fed7aa',
    orangeDark: '#92400e',
    orangeBg: '#fffbeb',
    orangeBorder: '#fde68a',
  },

  // Interactive elements - buttons, inputs, links
  interactive: {
    // Primary button (brown)
    primary: '#3d3935',
    primaryHover: '#2d2925',
    primaryText: '#ffffff',

    // Secondary button (light beige)
    secondary: '#e8e5e0',
    secondaryHover: '#d4cfc8',
    secondaryText: '#3d3935',

    // Disabled state
    disabled: '#f0ede8',
    disabledText: '#9ca3af',

    // Link color (use blue accent)
    link: '#3b82f6',
    linkHover: '#2563eb',

    // Accent color for highlights
    accent: '#3b82f6',
    accentHover: '#2563eb',
    accentLight: '#eff6ff',

    // Icon backgrounds
    iconBg: '#f0ede8',
    iconBgHover: '#e8e5e0',
    iconBgActive: '#5a5550',
  },

  // Status colors for alerts and messages
  status: {
    // Success states
    success: '#10b981',
    successText: '#065f46',
    successBg: '#f0fdf4',
    successBorder: '#bbf7d0',

    // Error states
    error: '#fef2f2',
    errorText: '#991b1b',
    errorBg: '#fef2f2',
    errorBorder: '#fecaca',

    // Warning states
    warning: '#f59e0b',
    warningText: '#92400e',
    warningBg: '#fffbeb',
    warningBorder: '#fde68a',

    // Info states
    info: '#3b82f6',
    infoText: '#1e40af',
    infoBg: '#eff6ff',
    infoBorder: '#bfdbfe',
  },

  // Icon colors
  icon: {
    default: '#f0ede8',
    hover: '#e8e5e0',
    active: '#5a5550',
  },

  // Shadows - neutral only, no color tints
  shadow: {
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
    md: '0 4px 6px 0 rgba(0, 0, 0, 0.05)',
    lg: '0 8px 16px 0 rgba(0, 0, 0, 0.06)',
    xl: '0 12px 24px 0 rgba(0, 0, 0, 0.08)',

    // Glow effects (with accent colors)
    tealGlow: '0 0 20px 2px rgba(81, 228, 220, 0.2)',
    tealGlowStrong: '0 8px 24px rgba(81, 228, 220, 0.25)',
  },
} as const;

// Typography scale
export const typography = {
  size: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Spacing system (pixels)
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '48px',
} as const;

// Border radius
export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

// Component style helpers
export const styles = {
  // Page/container background
  pageBackground: {
    background: colors.bg.primary,
  },

  // Card styles
  card: {
    default: {
      background: colors.bg.white,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.lg,
      boxShadow: colors.shadow.sm,
    },
    hover: {
      boxShadow: colors.shadow.md,
    },
    selected: {
      background: colors.bg.secondary,
      border: `2px solid ${colors.border.dark}`,
      boxShadow: colors.shadow.md,
    },
  },

  // Button styles
  button: {
    base: {
      padding: '12px 20px',
      borderRadius: radius.md,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.semibold,
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      border: 'none',
    },
    primary: {
      background: colors.interactive.primary,
      color: colors.interactive.primaryText,
    },
    primaryHover: {
      background: colors.interactive.primaryHover,
    },
    secondary: {
      background: colors.interactive.secondary,
      color: colors.interactive.secondaryText,
    },
    secondaryHover: {
      background: colors.interactive.secondaryHover,
    },
    disabled: {
      background: colors.interactive.disabled,
      color: colors.interactive.disabledText,
      cursor: 'not-allowed',
      opacity: 0.6,
    },
  },

  // Input styles
  input: {
    default: {
      padding: '12px 16px',
      fontSize: typography.size.sm,
      background: colors.bg.white,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.md,
      color: colors.text.primary,
    },
    focus: {
      outline: 'none',
      borderColor: colors.border.medium,
    },
    disabled: {
      background: colors.bg.tertiary,
      color: colors.text.quaternary,
      cursor: 'not-allowed',
    },
  },

  // Header styles
  header: {
    background: colors.bg.white,
    borderBottom: `1px solid ${colors.border.light}`,
    padding: '20px 24px',
  },

  // Modal overlay
  modalOverlay: {
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(4px)',
  },

  // Modal content
  modalContent: {
    background: colors.bg.white,
    borderRadius: radius.xl,
    boxShadow: colors.shadow.xl,
    border: `1px solid ${colors.border.default}`,
  },
} as const;

// Notification variants (for wave card component)
export const notificationStyles = {
  success: {
    background: colors.bg.white,
    waveFill: colors.accent.greenLight,
    iconBg: colors.accent.greenLight,
    iconColor: colors.accent.greenDark,
    titleColor: colors.accent.greenDark,
    textColor: colors.text.tertiary,
  },
  error: {
    background: colors.bg.white,
    waveFill: colors.accent.redLight,
    iconBg: colors.accent.redLight,
    iconColor: colors.accent.redDark,
    titleColor: colors.accent.redDark,
    textColor: colors.text.tertiary,
  },
  warning: {
    background: colors.bg.white,
    waveFill: colors.accent.orangeLight,
    iconBg: colors.accent.orangeLight,
    iconColor: colors.accent.orangeDark,
    titleColor: colors.accent.orangeDark,
    textColor: colors.text.tertiary,
  },
  info: {
    background: colors.bg.white,
    waveFill: colors.accent.blueLight,
    iconBg: colors.accent.blueLight,
    iconColor: colors.accent.blueDark,
    titleColor: colors.accent.blueDark,
    textColor: colors.text.tertiary,
  },
} as const;

// Helper functions for dynamic styles
export const createStyleObject = {
  // Card with optional selected state
  card: (selected: boolean = false) => ({
    ...styles.card.default,
    ...(selected && styles.card.selected),
  }),

  // Button with variant
  button: (variant: 'primary' | 'secondary' = 'primary', disabled: boolean = false) => {
    if (disabled) return { ...styles.button.base, ...styles.button.disabled };

    const variantStyles = variant === 'primary'
      ? styles.button.primary
      : styles.button.secondary;

    return { ...styles.button.base, ...variantStyles };
  },

  // Input with optional focus/disabled state
  input: (focused: boolean = false, disabled: boolean = false) => ({
    ...styles.input.default,
    ...(focused && styles.input.focus),
    ...(disabled && styles.input.disabled),
  }),
};

export default {
  colors,
  typography,
  spacing,
  radius,
  styles,
  notificationStyles,
  createStyleObject,
};
