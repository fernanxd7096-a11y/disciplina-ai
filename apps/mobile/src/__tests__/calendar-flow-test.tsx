import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { scheduledNotifications, setNotificationPermission } from '@/test/notifications';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';
const HOUR = 3_600_000;

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

function seedEvent(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  const uid = fake.session!.user.id;
  const start = new Date(Date.now() + 26 * HOUR);
  const row = {
    id: 'ev1',
    user_id: uid,
    title: 'Clase de redes',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 2 * HOUR).toISOString(),
    all_day: false,
    location: 'Aula 204',
    notes: null,
    timezone: 'America/Lima',
    category_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
  fake.seed('events', [row]);
  return row;
}

function seedReminder(fake: FakeSupabase, over: Record<string, unknown>) {
  fake.seed('reminders', [
    { id: `r-${Math.random()}`, user_id: fake.session!.user.id, event_id: 'ev1', task_id: null, offset_minutes: 60, remind_at: null, enabled: true, deleted_at: null, ...over },
  ]);
}

describe('calendario y recordatorios', () => {
  it('crea un evento con los avisos predeterminados (15 min y 1 h)', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/event/new' });

    fireEvent.changeText(await screen.findByTestId('event-title'), 'Exposición de tesis');
    // Los avisos predeterminados vienen marcados
    expect(screen.getByTestId('reminder-15')).toBeChecked();
    expect(screen.getByTestId('reminder-60')).toBeChecked();
    await press(screen.getByTestId('save-event'));

    await waitFor(() => expect(fake.rows('events')).toHaveLength(1));
    expect(fake.rows('events')[0]).toMatchObject({ title: 'Exposición de tesis', all_day: false, timezone: 'America/Lima' });
    await waitFor(() => expect(fake.rows('reminders')).toHaveLength(2));
    expect(fake.rows('reminders').map((r) => r.offset_minutes).sort()).toEqual([15, 60]);
    expect(fake.rows('reminders').every((r) => r.event_id === fake.rows('events')[0].id)).toBe(true);
  });

  it('exige título', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/event/new' });
    await press(await screen.findByTestId('save-event'));
    expect(await screen.findByText('Ponle un nombre al evento.')).toBeTruthy();
    expect(fake.rows('events')).toHaveLength(0);
  });

  it('programa los avisos en el teléfono y no los duplica al volver a sincronizar', async () => {
    const fake = signedInFake();
    seedEvent(fake);
    seedReminder(fake, { offset_minutes: 60 });
    seedReminder(fake, { offset_minutes: 1440 });
    renderRouter(APP_DIR, { initialUrl: '/' });

    await waitFor(() => expect(scheduledNotifications()).toHaveLength(2));
    const [first] = scheduledNotifications().sort((a, b) => a.trigger.date.getTime() - b.trigger.date.getTime());
    expect(first.content.title).toBe('Clase de redes');
    expect(first.content.body).toContain('Aula 204');
    expect(first.content.data.url).toBe('/event/ev1');
    expect(first.trigger.channelId).toBe('events');

    // Abrir otra pantalla y volver no crea copias.
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    await screen.findByTestId('planner-screen');
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(2));
  });

  it('al mover el evento, el aviso viejo se cancela y se crea uno nuevo a la hora correcta', async () => {
    const fake = signedInFake();
    const ev = seedEvent(fake);
    seedReminder(fake, { offset_minutes: 60 });
    renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(1));
    const oldId = scheduledNotifications()[0].identifier;

    // Cambia la hora en la base y vuelve a cargar la app (como tras editar en otro dispositivo).
    const newStart = new Date(new Date(ev.starts_at).getTime() + 3 * HOUR);
    Object.assign(fake.rows('events')[0], { starts_at: newStart.toISOString(), ends_at: new Date(newStart.getTime() + HOUR).toISOString() });
    renderRouter(APP_DIR, { initialUrl: '/' });

    await waitFor(() => expect(scheduledNotifications().map((n) => n.identifier)).not.toContain(oldId));
    expect(scheduledNotifications()).toHaveLength(1);
    expect(scheduledNotifications()[0].trigger.date.getTime()).toBe(newStart.getTime() - HOUR);
  });

  it('al eliminar el evento se cancelan sus avisos', async () => {
    const fake = signedInFake();
    seedEvent(fake);
    seedReminder(fake, { offset_minutes: 60 });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(1));

    fireEvent.press(await screen.findByRole('tab', { name: 'Calendario' }));
    const eventDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(fake.rows('events')[0].starts_at as string));
    await press(await screen.findByTestId(`day-${eventDay}`));
    await press(await screen.findByTestId('event-ev1'));
    await press(await screen.findByTestId('delete-event'));

    await waitFor(() => expect(fake.rows('events')).toHaveLength(0));
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(0));
  });

  it('sin permiso no programa nada y Ajustes ofrece activarlo', async () => {
    const fake = signedInFake();
    seedEvent(fake);
    seedReminder(fake, { offset_minutes: 60 });
    setNotificationPermission(false, true);
    renderRouter(APP_DIR, { initialUrl: '/settings' });

    expect(await screen.findByText('Sin activar')).toBeTruthy();
    expect(scheduledNotifications()).toHaveLength(0);

    setNotificationPermission(true);
    await press(screen.getByTestId('enable-notifications'));
    expect(await screen.findByText('Activado')).toBeTruthy();
  });

  it('los hábitos con hora de aviso se programan solo los días que tocan', async () => {
    const fake = signedInFake();
    fake.seed('habits', [
      {
        id: 'h1', user_id: fake.session!.user.id, name: 'Leer', icon: null, color: null, category: 'reading', frequency: 'daily',
        days_of_week: [1, 3, 5], target_per_period: 1, unit: null, reminder_time: '21:00:00', status: 'active',
        start_date: '2026-01-01', sort_order: 0, created_at: '', updated_at: '', deleted_at: null,
      },
    ]);
    renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(scheduledNotifications().length).toBeGreaterThan(0));
    const days = scheduledNotifications().map((n) => new Date(n.trigger.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Lima' }));
    expect(new Set(days)).toEqual(new Set(['Mon', 'Wed', 'Fri']));
    expect(scheduledNotifications().every((n) => n.trigger.channelId === 'habits')).toBe(true);
  });

  it('desactivar avisos de hábitos en Ajustes los cancela', async () => {
    const fake = signedInFake();
    fake.seed('habits', [
      {
        id: 'h1', user_id: fake.session!.user.id, name: 'Leer', icon: null, color: null, category: 'reading', frequency: 'daily',
        days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null, reminder_time: '21:00:00', status: 'active',
        start_date: '2026-01-01', sort_order: 0, created_at: '', updated_at: '', deleted_at: null,
      },
    ]);
    fake.seed('notification_prefs', [
      { user_id: fake.session!.user.id, default_event_offsets: [15, 60], habit_reminders: true, task_reminders: true, quiet_start: null, quiet_end: null },
    ]);
    renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(scheduledNotifications().length).toBeGreaterThan(0));

    renderRouter(APP_DIR, { initialUrl: '/settings' });
    await press(await screen.findByTestId('pref-habits'));
    await waitFor(() => expect(fake.rows('notification_prefs')[0].habit_reminders).toBe(false));

    renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(0));
  });

  it('el inicio muestra el próximo evento y cuánto falta', async () => {
    const fake = signedInFake();
    seedEvent(fake, { starts_at: new Date(Date.now() + 2 * HOUR + 60_000).toISOString(), ends_at: new Date(Date.now() + 3 * HOUR).toISOString() });
    renderRouter(APP_DIR, { initialUrl: '/' });
    const card = await screen.findByTestId('next-event');
    expect(within(card).getByText('Clase de redes')).toBeTruthy();
    expect(within(card).getByTestId('next-event-when').props.children).toMatch(/^en 2 h/);
  });

  it('cerrar sesión borra los avisos de la cuenta del teléfono', async () => {
    const fake = signedInFake();
    seedEvent(fake);
    seedReminder(fake, { offset_minutes: 60 });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    renderRouter(APP_DIR, { initialUrl: '/settings' });
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(1));

    await press(await screen.findByTestId('sign-out'));
    await waitFor(() => expect(scheduledNotifications()).toHaveLength(0));
  });
});
