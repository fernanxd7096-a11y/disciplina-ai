import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { scheduledNotifications } from '@/test/notifications';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

function seedNote(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  fake.seed('notes', [
    { id: 'n1', user_id: fake.session!.user.id, title: 'Apuntes de redes', body: 'Capa de red', pinned: false, archived_at: null, task_id: null, event_id: null, category_id: null, created_at: '2026-10-01', updated_at: '2026-10-01', deleted_at: null, ...over },
  ]);
}

function seedTask(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
  fake.seed('tasks', [{ id: 't1', user_id: fake.session!.user.id, title: 'Entregar informe', description: null, priority: 3, due_at: due, status: 'todo', completed_at: null, rescheduled_count: 0, category_id: null, created_at: '', updated_at: '', deleted_at: null, ...over }]);
}

describe('organización: categorías, etiquetas y vínculos', () => {
  it('en una nota crea categoría y etiqueta, y la vincula a una tarea', async () => {
    const fake = signedInFake();
    seedNote(fake);
    seedTask(fake);
    renderRouter(APP_DIR, { initialUrl: '/note/n1' });

    await press(await screen.findByTestId('organize-note'));
    await press(await screen.findByTestId('new-category'));
    fireEvent.changeText(screen.getByTestId('new-category-name'), 'Universidad');
    await press(screen.getByTestId('create-category'));
    await waitFor(() => expect(fake.rows('notes')[0].category_id).toBe(fake.rows('categories')[0].id));
    expect(fake.rows('categories')[0]).toMatchObject({ name: 'Universidad', scope: 'note' });

    await press(screen.getByTestId('new-tag'));
    fireEvent.changeText(screen.getByTestId('new-tag-name'), '#examen');
    await press(screen.getByTestId('create-tag'));
    await waitFor(() => expect(fake.rows('note_tags')).toHaveLength(1));
    expect(fake.rows('tags')[0]).toMatchObject({ name: 'examen' });

    await press(await screen.findByTestId('link-task-t1'));
    await waitFor(() => expect(fake.rows('notes')[0].task_id).toBe('t1'));
  });

  it('la tarea muestra sus notas vinculadas y permite programarle avisos', async () => {
    const fake = signedInFake();
    seedTask(fake);
    seedNote(fake, { task_id: 't1' });
    renderRouter(APP_DIR, { initialUrl: '/task/t1' });

    expect(await screen.findByTestId('linked-notes')).toBeTruthy();
    expect(screen.getByText('Apuntes de redes')).toBeTruthy();
    await press(screen.getByTestId('task-reminder-60'));
    await press(screen.getByTestId('save-task'));
    await waitFor(() => expect(fake.rows('reminders')).toHaveLength(1));
    expect(fake.rows('reminders')[0]).toMatchObject({ task_id: 't1', offset_minutes: 60 });
    await waitFor(() => expect(scheduledNotifications().some((n) => n.trigger.channelId === 'tasks')).toBe(true));
  });

  it('filtra notas por etiqueta', async () => {
    const fake = signedInFake();
    const uid = fake.session!.user.id;
    seedNote(fake);
    fake.seed('notes', [{ id: 'n2', user_id: uid, title: 'Lista del mercado', body: 'pan', pinned: false, archived_at: null, task_id: null, event_id: null, category_id: null, created_at: '2026-10-02', updated_at: '2026-10-02', deleted_at: null }]);
    fake.seed('tags', [{ id: 'tg1', user_id: uid, name: 'examen', deleted_at: null }]);
    fake.seed('note_tags', [{ user_id: uid, note_id: 'n1', tag_id: 'tg1' }]);
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    await press(await screen.findByRole('tab', { name: 'Notas' }));
    expect(await screen.findByText('Lista del mercado')).toBeTruthy();
    await press(await screen.findByTestId('filter-tag-examen'));
    await waitFor(() => expect(screen.queryByText('Lista del mercado')).toBeNull());
    expect(screen.getByText('Apuntes de redes')).toBeTruthy();
  });

  it('crea un evento semanal desde el formulario', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/event/new' });
    fireEvent.changeText(await screen.findByTestId('event-title'), 'Clase de inglés');
    await press(screen.getByTestId('recurrence-weekly'));
    await press(screen.getByTestId('save-event'));
    await waitFor(() => expect(fake.rows('events')).toHaveLength(1));
    expect(fake.rows('events')[0]).toMatchObject({ title: 'Clase de inglés', recurrence: 'weekly', recurrence_until: null });
  });
});
