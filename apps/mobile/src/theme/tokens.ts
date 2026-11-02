export const colors = {
  brand: {
    50: '#E7F5F1',
    100: '#C6E9E1',
    300: '#6FC7B6',
    500: '#12806C',
    600: '#0F6B5B',
    700: '#0B5449',
    900: '#062E28',
  },
  background: '#F6F7F5',
  surface: '#FFFFFF',
  text: '#10201C',
  textMuted: '#5C6B66',
  border: '#DDE5E1',
  success: '#1E8E5A',
  warning: '#C77700',
  danger: '#C0392B',
  info: '#2C7BE5',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} as const;
