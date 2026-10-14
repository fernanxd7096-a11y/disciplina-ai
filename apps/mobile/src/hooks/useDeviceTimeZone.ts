import { DEFAULT_TIME_ZONE } from '@/lib/dates';

/**
 * Zona horaria del dispositivo. En la Fase 3 se reemplaza por la del perfil
 * del usuario (editable en Ajustes), usando esta solo como valor inicial.
 */
export function useDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
