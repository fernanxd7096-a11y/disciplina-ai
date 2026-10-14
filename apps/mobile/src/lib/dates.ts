/**
 * Utilidades de fecha en español. Todas reciben `now` y `timeZone` explícitos
 * para ser deterministas en pruebas y respetar la zona horaria del perfil.
 */

export const DEFAULT_TIME_ZONE = 'America/Lima';
export const DEFAULT_LOCALE = 'es-PE';

/** Hora local (0–23) de un instante en una zona horaria IANA. */
export function localHour(now: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(now);
  return Number(hour) % 24;
}

/** Saludo según la hora local: 5–11 mañana, 12–18 tarde, resto noche. */
export function greeting(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const h = localHour(now, timeZone);
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "martes, 13 de octubre" con la primera letra en mayúscula. */
export function formatLongDate(
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clave de día local "AAAA-MM-DD" (para registros diarios de hábitos y comidas). */
export function localDayKey(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(now);
}

/**
 * Tiempo restante legible hasta un instante: "en 45 min", "en 2 h 10 min", "en 3 días".
 * Devuelve "ahora" si ya pasó o falta menos de un minuto.
 */
export function timeUntil(target: Date, now: Date): string {
  const diffMin = Math.floor((target.getTime() - now.getTime()) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `en ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) {
    const mins = diffMin % 60;
    return mins ? `en ${hours} h ${mins} min` : `en ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'en 1 día' : `en ${days} días`;
}
