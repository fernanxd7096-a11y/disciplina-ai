import { allDayRange, diffReminders, eventsOnDay, expandEvent, monthGrid, mondayOf, nextEvent, occursOn, reminderLabel, shiftMonth } from '../logic';
import type { CalendarEvent } from '../types';

const TZ = 'America/Lima';
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36),
  user_id: 'u',
  title: 'x',
  starts_at: '2026-10-13T15:00:00Z',
  ends_at: '2026-10-13T16:00:00Z',
  all_day: false,
  location: null,
  notes: null,
  timezone: TZ,
  category_id: null,
  recurrence: 'none',
  recurrence_until: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});

describe('calendario', () => {
  it('ubica eventos por día local (no por UTC)', () => {
    // 22:00 del 13 en Lima = 03:00 UTC del 14
    const noche = ev({ starts_at: '2026-10-14T03:00:00Z', ends_at: '2026-10-14T04:00:00Z' });
    expect(occursOn(noche, '2026-10-13', TZ)).toBe(true);
    expect(occursOn(noche, '2026-10-14', TZ)).toBe(false);
  });

  it('un evento de varios días aparece en todos sus días', () => {
    const viaje = ev({ starts_at: '2026-10-13T13:00:00Z', ends_at: '2026-10-15T23:00:00Z' });
    expect(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d) => occursOn(viaje, d, TZ))).toEqual([
      false, true, true, true, false,
    ]);
  });

  it('ordena: todo el día primero, luego por hora; sin borrados', () => {
    const list = eventsOnDay(
      [
        ev({ id: 'tarde', starts_at: '2026-10-13T20:00:00Z', ends_at: '2026-10-13T21:00:00Z' }),
        ev({ id: 'manana', starts_at: '2026-10-13T14:00:00Z', ends_at: '2026-10-13T15:00:00Z' }),
        ev({ id: 'todo', all_day: true, ...allDayRange('2026-10-13', '2026-10-13', TZ) }),
        ev({ id: 'borrado', deleted_at: 'x' }),
      ],
      '2026-10-13',
      TZ,
    );
    expect(list.map((e) => e.id)).toEqual(['todo', 'manana', 'tarde']);
  });

  it('construye la cuadrícula del mes de lunes a domingo', () => {
    const oct = monthGrid('2026-10');
    expect(oct[0][0]).toEqual({ day: '2026-09-28', inMonth: false });
    expect(oct[0][3]).toEqual({ day: '2026-10-01', inMonth: true });
    expect(oct.at(-1)!.at(-1)!.day).toBe('2026-11-01');
    expect(oct).toHaveLength(5);
    expect(monthGrid('2026-02').every((w) => w.length === 7)).toBe(true);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
  });

  it('rango de todo el día en la zona del usuario', () => {
    expect(allDayRange('2026-10-13', '2026-10-13', TZ)).toEqual({
      starts_at: '2026-10-13T05:00:00.000Z',
      ends_at: '2026-10-14T04:59:00.000Z',
    });
  });
});

describe('recordatorios del formulario', () => {
  it('etiquetas legibles', () => {
    expect(reminderLabel({ offset_minutes: 15, remind_at: null }, TZ)).toBe('15 min antes');
    expect(reminderLabel({ offset_minutes: 120, remind_at: null }, TZ)).toBe('2 h antes');
    expect(reminderLabel({ offset_minutes: 2880, remind_at: null }, TZ)).toBe('2 días antes');
  });

  it('calcula qué borrar y qué crear, sin duplicar', () => {
    const saved = [
      { id: 'a', offset_minutes: 15, remind_at: null },
      { id: 'b', offset_minutes: 60, remind_at: null },
    ];
    const { remove, add } = diffReminders(saved, [
      { offset_minutes: 15, remind_at: null },
      { offset_minutes: 1440, remind_at: null },
      { offset_minutes: 1440, remind_at: null },
    ]);
    expect(remove.map((r) => r.id)).toEqual(['b']);
    expect(add).toEqual([{ offset_minutes: 1440, remind_at: null }]);
  });
});

describe('nextEvent', () => {
  const now = new Date('2026-10-13T15:30:00Z'); // 10:30 Lima
  it('elige el que está en curso o el próximo con hora', () => {
    const enCurso = ev({ id: 'curso', starts_at: '2026-10-13T15:00:00Z', ends_at: '2026-10-13T16:00:00Z' });
    const luego = ev({ id: 'luego', starts_at: '2026-10-13T19:00:00Z', ends_at: '2026-10-13T20:00:00Z' });
    const pasado = ev({ id: 'pasado', starts_at: '2026-10-13T12:00:00Z', ends_at: '2026-10-13T13:00:00Z' });
    expect(nextEvent([luego, pasado, enCurso], now, TZ)).toEqual({ event: enCurso, ongoing: true });
    expect(nextEvent([luego, pasado], now, TZ)).toEqual({ event: luego, ongoing: false });
  });

  it('usa uno de todo el día solo si no hay otro con hora', () => {
    const todo = ev({ id: 'todo', all_day: true, ...allDayRange('2026-10-13', '2026-10-13', TZ) });
    const luego = ev({ id: 'luego', starts_at: '2026-10-13T19:00:00Z', ends_at: '2026-10-13T20:00:00Z' });
    expect(nextEvent([todo, luego], now, TZ)?.event.id).toBe('luego');
    expect(nextEvent([todo], now, TZ)?.event.id).toBe('todo');
    expect(nextEvent([], now, TZ)).toBeNull();
  });
});

describe('eventos recurrentes', () => {
  it('semanal: aparece cada semana a la misma hora local hasta la fecha de fin', () => {
    const e = ev({ id: 'w', starts_at: '2026-10-13T15:00:00Z', ends_at: '2026-10-13T16:00:00Z', recurrence: 'weekly', recurrence_until: '2026-10-27' });
    const occ = expandEvent(e, '2026-10-01', '2026-12-31', TZ);
    expect(occ.map((o) => o.starts_at)).toEqual(['2026-10-13T15:00:00.000Z', '2026-10-20T15:00:00.000Z', '2026-10-27T15:00:00.000Z']);
    expect(eventsOnDay([e], '2026-10-20', TZ)).toHaveLength(1);
    expect(eventsOnDay([e], '2026-10-21', TZ)).toHaveLength(0);
    expect(eventsOnDay([e], '2026-11-03', TZ)).toHaveLength(0);
  });

  it('mantiene la hora local al cambiar el horario de verano', () => {
    // Madrid: 09:00 local el 20 oct (UTC+2) y el 3 nov (UTC+1)
    const e = ev({ starts_at: '2026-10-20T07:00:00Z', ends_at: '2026-10-20T08:00:00Z', timezone: 'Europe/Madrid', recurrence: 'weekly' });
    const occ = expandEvent(e, '2026-10-20', '2026-11-03', 'Europe/Madrid');
    expect(occ.map((o) => o.starts_at)).toEqual(['2026-10-20T07:00:00.000Z', '2026-10-27T08:00:00.000Z', '2026-11-03T08:00:00.000Z']);
  });

  it('mensual el día 31 se salta los meses que no lo tienen', () => {
    const e = ev({ starts_at: '2026-10-31T15:00:00Z', ends_at: '2026-10-31T16:00:00Z', recurrence: 'monthly' });
    const days = expandEvent(e, '2026-10-01', '2027-01-31', TZ).map((o) => o.starts_at.slice(0, 10));
    expect(days).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  it('el próximo evento considera repeticiones', () => {
    const e = ev({ starts_at: '2026-10-01T15:00:00Z', ends_at: '2026-10-01T16:00:00Z', recurrence: 'daily' });
    const r = nextEvent([e], new Date('2026-10-13T17:00:00Z'), TZ);
    expect(r?.event.starts_at).toBe('2026-10-14T15:00:00.000Z');
  });
});
