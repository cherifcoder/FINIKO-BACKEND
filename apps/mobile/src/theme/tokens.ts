/**
 * Design tokens FINIKO.
 *
 * Palette alignée sur l'application FINIKO v1 : bleu #2563EB en couleur
 * primaire, bleu profond #1E3A8A pour les en-têtes, neutres gris/slate,
 * émeraude pour le succès, ambre pour l'avertissement et rouge pour l'erreur.
 */
export const colors = {
  brand: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    300: '#93C5FD',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    900: '#1E3A8A',
  },
  accent: {
    orange: '#FF7900',
    purple: '#9333EA',
    cyan: '#00B8D9',
  },
  neutral: {
    0: '#FFFFFF',
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    400: '#9CA3AF',
    500: '#6B7280',
    700: '#374151',
    900: '#111827',
  },
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  success: '#059669',
  successSurface: '#ECFDF5',
  successBorder: '#A7F3D0',
  warning: '#D97706',
  warningSurface: '#FFFBEB',
  warningBorder: '#FDE68A',
  danger: '#DC2626',
  dangerSurface: '#FEF2F2',
  dangerBorder: '#FECACA',
  info: '#2563EB',
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
