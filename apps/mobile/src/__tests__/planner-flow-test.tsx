import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

function seedTask(fake: FakeSupabase, over: Record<string, unknown>) {
  const row = {
    user_id: fake.session!.user.id,
    title: 'Tarea',
    description: null,
    priority: 3,
    due_at: null,
    status: 'todo',
    completed_at: null,
    rescheduled_count: 0,
    category_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
  fake.seed('tasks', [row]);
  return row;
}

async function pressAndSettle(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

describe('tareas', () => {
  it('crea una tarea para mañana con prioridad alta', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/planner' });

    await pressAndSettle(await screen.findByTestId('planner-add'));
    fireEvent.changeText(await screen.findByTestId('task-title'), 'Entregar informe');
    fireEvent.press(screen.getByTestId('priority-2'));
    fireEvent.press(screen.getByTestId('due-tomorrow'));
    await pressAndSettle(screen.getByTestId('save-task'));

    await waitFor(() => expect(fake.rows('tasks')).toHaveLength(1));
    const saved = fake.rows('tasks')[0];
    expect(saved).toMatchObject({ title: 'Entregar informe', priority: 2 });
    expect(saved.due_at).toEqual(expect.stringMatching(/T04:59:00\.000Z$/)); // 23:59 en Lima
    expect(await screen.findByText('Entregar informe')).toBeTruthy();
    expect(screen.getByTestId('task-group-upcoming')).toBeTruthy();
  });

  it('exige el título', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/task/new' });
    await pressAndSettle(await screen.findByTestId('save-task'));
    expect(await screen.findByText('Escribe qué tienes que hacer.')).toBeTruthy();
    expect(fake.rows('tasks')).toHaveLength(0);
  });

  it('marca como completada y la mueve a Completadas', async () => {
    const fake = signedInFake();
    seedTask(fake, { id: 't1', title: 'Comprar cuaderno' });
    renderRouter(APP_DIR, { initialUrl: '/planner' });

    await pressAndSettle(await screen.findByTestId('task-check-t1'));
    await waitFor(() => expect(fake.rows('tasks')[0]).toMatchObject({ status: 'done' }));
    expect(fake.rows('tasks')[0].completed_at).toBeTruthy();
    expect(within(await screen.findByTestId('task-group-done')).getByText('Comprar cuaderno')).toBeTruthy();
  });

  it('muestra atrasadas y las mueve a hoy contando la reprogramación', async () => {
    const fake = signedInFake();
    seedTask(fake, { id: 't-old', title: 'Pagar matrícula', due_at: '2026-01-10T15:00:00Z' });
    renderRouter(APP_DIR, { initialUrl: '/planner' });

    const overdue = await screen.findByTestId('task-group-overdue');
    expect(within(overdue).getByText('Pagar matrícula')).toBeTruthy();
    expect(within(overdue).getByText(/Vencida/)).toBeTruthy();

    await pressAndSettle(screen.getByText('Mover a hoy'));
    await waitFor(() => expect(fake.rows('tasks')[0].rescheduled_count).toBe(1));
    expect(new Date(fake.rows('tasks')[0].due_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(await screen.findByTestId('task-group-today')).toBeTruthy();
    expect(screen.queryByTestId('task-group-overdue')).toBeNull();
  });

  it('edita una tarea', async () => {
    const fake = signedInFake();
    seedTask(fake, { id: 't1', title: 'Viejo título' });
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    await pressAndSettle(await screen.findByTestId('task-row-t1'));

    fireEvent.changeText(await screen.findByTestId('task-title'), 'Nuevo título');
    await pressAndSettle(screen.getByTestId('save-task'));
    await waitFor(() => expect(fake.rows('tasks')[0].title).toBe('Nuevo título'));
    expect(await screen.findByText('Nuevo título')).toBeTruthy();
  });

  it('elimina una tarea tras confirmar', async () => {
    const fake = signedInFake();
    seedTask(fake, { id: 't1', title: 'Borrar esto' });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    await pressAndSettle(await screen.findByTestId('task-row-t1'));
    await pressAndSettle(await screen.findByTestId('delete-task'));
    await waitFor(() => expect(fake.rows('tasks')[0].deleted_at).not.toBeNull());
    expect(await screen.findByTestId('planner-empty-tasks')).toBeTruthy();
  });
});

describe('notas', () => {
  it('se guarda sola mientras se escribe, sin crear duplicados', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/note/new' });

    const body = await screen.findByTestId('note-body');
    fireEvent.changeText(body, 'Estudiar');
    await waitFor(() => expect(fake.rows('notes')).toHaveLength(1), { timeout: 3000 });

    fireEvent.changeText(body, 'Estudiar bases de datos');
    await waitFor(() => expect(fake.rows('notes')[0].body).toBe('Estudiar bases de datos'), { timeout: 3000 });
    expect(fake.rows('notes')).toHaveLength(1);
    expect(await screen.findByText('Guardado')).toBeTruthy();
  });

  it('una nota vacía no se crea', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/note/new' });
    fireEvent.changeText(await screen.findByTestId('note-title'), '   ');
    // renderRouter usa temporizadores falsos: se avanza más que el autoguardado (0,7 s).
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fake.rows('notes')).toHaveLength(0);
    expect(fake.calls.filter((c) => c.table === 'notes' && c.op !== 'select')).toHaveLength(0);
  });

  it('busca sin importar acentos y filtra archivadas', async () => {
    const fake = signedInFake();
    const uid = fake.session!.user.id;
    fake.seed('notes', [
      { id: 'n1', user_id: uid, title: 'Educación física', body: 'Llevar zapatillas', pinned: false, archived_at: null, deleted_at: null, task_id: null, event_id: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' },
      { id: 'n2', user_id: uid, title: 'Tesis', body: 'Capítulo 3', pinned: false, archived_at: null, deleted_at: null, task_id: null, event_id: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-03T00:00:00Z' },
      { id: 'n3', user_id: uid, title: 'Ideas viejas', body: '', pinned: false, archived_at: '2026-10-01T00:00:00Z', deleted_at: null, task_id: null, event_id: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    ]);
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    fireEvent.press(await screen.findByRole('tab', { name: 'Notas' }));

    fireEvent.changeText(await screen.findByTestId('notes-search'), 'educacion');
    expect(await screen.findByTestId('note-n1')).toBeTruthy();
    expect(screen.queryByTestId('note-n2')).toBeNull();
    expect(screen.queryByTestId('note-n3')).toBeNull();

    fireEvent.changeText(screen.getByTestId('notes-search'), '');
    fireEvent.press(screen.getByTestId('notes-archived'));
    expect(await screen.findByTestId('note-n3')).toBeTruthy();
    expect(screen.queryByTestId('note-n1')).toBeNull();
  });
});
