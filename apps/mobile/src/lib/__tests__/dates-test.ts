import { formatLongDate, greeting, localDayKey, localHour, timeUntil } from '../dates';

// 2026-10-13 21:39 en Lima (UTC-5) = 2026-10-14 02:39 UTC
const limaNight = new Date('2026-10-14T02:39:00Z');

describe('localHour', () => {
  it('convierte a la hora local de la zona indicada', () => {
    expect(localHour(limaNight, 'America/Lima')).toBe(21);
    expect(localHour(limaNight, 'UTC')).toBe(2);
  });
});

describe('greeting', () => {
  it.each([
    ['2026-10-13T10:00:00Z', 'Buenos días'], // 05:00 Lima
    ['2026-10-13T16:59:00Z', 'Buenos días'], // 11:59 Lima
    ['2026-10-13T17:00:00Z', 'Buenas tardes'], // 12:00 Lima
    ['2026-10-13T23:59:00Z', 'Buenas tardes'], // 18:59 Lima
    ['2026-10-14T00:00:00Z', 'Buenas noches'], // 19:00 Lima
    ['2026-10-13T09:59:00Z', 'Buenas noches'], // 04:59 Lima
  ])('a las %s devuelve "%s"', (iso, expected) => {
    expect(greeting(new Date(iso), 'America/Lima')).toBe(expected);
  });
});

describe('formatLongDate', () => {
  it('usa el día local, en español y con mayúscula inicial', () => {
    // En UTC ya es 14, pero en Lima sigue siendo martes 13
    const text = formatLongDate(limaNight, 'America/Lima', 'es-PE');
    expect(text).toMatch(/^Martes/);
    expect(text).toContain('13');
    expect(text.toLowerCase()).toContain('octubre');
  });
});

describe('localDayKey', () => {
  it('devuelve AAAA-MM-DD según la zona, no según UTC', () => {
    expect(localDayKey(limaNight, 'America/Lima')).toBe('2026-10-13');
    expect(localDayKey(limaNight, 'UTC')).toBe('2026-10-14');
  });
});

describe('timeUntil', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const plus = (min: number) => new Date(now.getTime() + min * 60000);

  it.each([
    [-5, 'ahora'],
    [0, 'ahora'],
    [45, 'en 45 min'],
    [60, 'en 1 h'],
    [130, 'en 2 h 10 min'],
    [60 * 24, 'en 1 día'],
    [60 * 24 * 3 + 30, 'en 3 días'],
  ])('%i minutos → "%s"', (min, expected) => {
    expect(timeUntil(plus(min), now)).toBe(expected);
  });
});
