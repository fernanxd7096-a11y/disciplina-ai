import { DarkTheme, type Theme } from 'expo-router';

import { colors } from './tokens';

/** Tema de navegación alineado con los tokens (cabeceras, fondos, barra de pestañas). */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};
