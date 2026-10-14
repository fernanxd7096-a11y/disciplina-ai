/**
 * Tokens de diseño de DISCIPLINA AI.
 * Única fuente de verdad para colores, espaciado, radios y tipografía.
 * Ningún componente debe usar valores de color "sueltos": siempre desde aquí.
 */

export const colors = {
  // Fondos (de más profundo a más elevado)
  background: '#070B14',
  surface: '#0E1524',
  surfaceRaised: '#141D30',
  surfacePressed: '#1A2540',

  // Bordes
  border: '#1E2A40',
  borderStrong: '#2B3A56',

  // Texto
  text: '#E8EEF8',
  textSecondary: '#9AA8BE',
  textMuted: '#64748B',
  textOnAccent: '#04121A',

  // Acento principal (cian eléctrico) y variantes
  accent: '#22D3EE',
  accentStrong: '#0EA5E9',
  accentSoft: 'rgba(34, 211, 238, 0.12)',

  // Estados
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.12)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.12)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.12)',

  // Colores por dominio (para anillos, iconos y gráficas)
  habits: '#22D3EE',
  tasks: '#818CF8',
  training: '#F472B6',
  nutrition: '#34D399',
  events: '#FBBF24',

  overlay: 'rgba(3, 6, 12, 0.72)',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
  metric: { fontSize: 26, lineHeight: 30, fontWeight: '700' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Altura mínima de cualquier área táctil (accesibilidad Android). */
export const minTouchSize = 48;

/** Ancho máximo del contenido en tablets y pantallas grandes. */
export const maxContentWidth = 640;
