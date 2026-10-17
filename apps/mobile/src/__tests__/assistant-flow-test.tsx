import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

/** Simula la Edge Function: guarda mensajes y propuestas con la sesión del usuario y responde. */
function fakeChat(fake: FakeSupabase, reply: string, proposals: { action_type: string; payload: Record<string, unknown> }[] = []) {
  fake.functionHandlers['assistant-chat'] = async (body) => {
    const b = body as { conversation_id: string | null; message: string };
    const client = fake.asClient();
    let cid = b.conversation_id;
    if (!cid) {
      const { data } = await client.from('ai_conversations').insert({ title: b.message.slice(0, 60) }).select('id').single();
      cid = (data as { id: string }).id;
    }
    await client.from('ai_messages').insert({ conversation_id: cid, role: 'user', content: b.message, created_at: '2026-10-16T10:00:00Z' });
    const { data: m } = await client.from('ai_messages').insert({ conversation_id: cid, role: 'assistant', content: reply, created_at: '2026-10-16T10:00:01Z' }).select('id').single();
    const mid = (m as { id: string }).id;
    const { data: saved } = proposals.length ? await client.from('ai_action_proposals').insert(proposals.map((p) => ({ ...p, message_id: mid }))).select('id, action_type, payload') : { data: [] };
    return { data: { provider: 'gemini', model: 'x', conversation_id: cid, message: { id: mid, role: 'assistant', content: reply }, proposals: saved, context_used: ['planner', 'habits'] } };
  };
}

describe('asistente', () => {
  it('responde y muestra qué datos usó', async () => {
    const fake = signedInFake();
    fakeChat(fake, 'Hoy tienes 2 tareas pendientes.');
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    await press(await screen.findByText('¿Qué tengo pendiente hoy?'));
    expect(await screen.findByText('Hoy tienes 2 tareas pendientes.')).toBeTruthy();
    expect(screen.getByText('Usó: tareas y calendario, hábitos')).toBeTruthy();
    expect(screen.getByText('Google Gemini')).toBeTruthy();
    expect(fake.functionCalls[0]).toEqual({ name: 'assistant-chat', body: { conversation_id: null, message: '¿Qué tengo pendiente hoy?' } });
  });

  it('una propuesta no se aplica hasta confirmar; al confirmar crea la tarea en la zona horaria del usuario', async () => {
    const fake = signedInFake();
    fakeChat(fake, 'Te propongo una tarea.', [{ action_type: 'create_task', payload: { title: 'Repasar redes', priority: 2, due_date: '2026-10-20', due_time: '18:00' } }]);
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'Recuérdame repasar redes el lunes 6 pm');
    await press(screen.getByTestId('chat-send'));

    const card = await screen.findByTestId('proposal-create_task');
    expect(within(card).getByText('Crear tarea: Repasar redes')).toBeTruthy();
    expect(within(card).getByText('Prioridad alta')).toBeTruthy();
    expect(fake.rows('tasks')).toHaveLength(0);

    await press(within(card).getByTestId('proposal-apply'));
    await waitFor(() => expect(fake.rows('tasks')).toHaveLength(1));
    expect(fake.rows('tasks')[0]).toMatchObject({ title: 'Repasar redes', priority: 2, due_at: '2026-10-20T23:00:00.000Z' }); // 18:00 Lima
    await waitFor(() => expect(fake.rows('ai_action_proposals')[0]).toMatchObject({ status: 'applied' }));
    expect(await screen.findByText('Aplicado')).toBeTruthy();
  });

  it('crea un evento con los avisos predeterminados y permite descartar otra propuesta', async () => {
    const fake = signedInFake();
    fakeChat(fake, 'Dos ideas.', [
      { action_type: 'create_event', payload: { title: 'Estudio', date: '2026-10-18', start_time: '09:00', end_time: '11:00' } },
      { action_type: 'create_habit', payload: { name: 'Leer', category: 'reading', frequency: 'daily', days_of_week: [1, 3, 5], target_per_period: 1 } },
    ]);
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'organiza mi sábado');
    await press(screen.getByTestId('chat-send'));

    const ev = await screen.findByTestId('proposal-create_event');
    expect(within(ev).getByText(/09:00–11:00/)).toBeTruthy();
    await press(within(ev).getByTestId('proposal-apply'));
    await waitFor(() => expect(fake.rows('events')).toHaveLength(1));
    expect(fake.rows('events')[0]).toMatchObject({ title: 'Estudio', starts_at: '2026-10-18T14:00:00.000Z', ends_at: '2026-10-18T16:00:00.000Z', timezone: 'America/Lima' });
    await waitFor(() => expect(fake.rows('reminders').map((r) => r.offset_minutes).sort()).toEqual([15, 60]));

    const hab = screen.getByTestId('proposal-create_habit');
    expect(within(hab).getByText('Lectura · L X V')).toBeTruthy();
    await press(within(hab).getByTestId('proposal-reject'));
    await waitFor(() => expect(fake.rows('ai_action_proposals').find((p) => p.action_type === 'create_habit')).toMatchObject({ status: 'rejected' }));
    expect(fake.rows('habits')).toHaveLength(0);
  });

  it('reprograma tareas atrasadas al confirmar', async () => {
    const fake = signedInFake();
    const uid = fake.session!.user.id;
    fake.seed('tasks', [
      { id: 't1', user_id: uid, title: 'Informe', description: null, priority: 3, due_at: '2026-10-10T04:59:00.000Z', status: 'todo', completed_at: null, rescheduled_count: 0, category_id: null, created_at: '', updated_at: '', deleted_at: null },
    ]);
    fakeChat(fake, 'Muevo el informe.', [{ action_type: 'reschedule_tasks', payload: { task_ids: ['t1'], due_date: '2026-10-17' } }]);
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'reorganiza');
    await press(screen.getByTestId('chat-send'));
    const card = await screen.findByTestId('proposal-reschedule_tasks');
    expect(within(card).getByText('• Informe')).toBeTruthy();
    await press(within(card).getByTestId('proposal-apply'));
    await waitFor(() => expect(fake.rows('tasks')[0]).toMatchObject({ due_at: '2026-10-18T04:59:00.000Z', rescheduled_count: 1 }));
  });

  it('muestra el límite diario y conserva el texto para reintentar', async () => {
    const fake = signedInFake();
    fake.functionHandlers['assistant-chat'] = () => ({
      error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: { code: 'quota_exceeded', message: 'x' } }), { status: 429 }) },
    });
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'hola');
    await press(screen.getByTestId('chat-send'));
    expect(await screen.findByText(/límite diario de uso de IA/)).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.value).toBe('hola');
  });

  it('borra todo el historial de conversaciones', async () => {
    const fake = signedInFake();
    const uid = fake.session!.user.id;
    fake.seed('ai_conversations', [
      { id: 'c1', user_id: uid, title: 'Semana', created_at: '2026-10-15', updated_at: '2026-10-15' },
      { id: 'c2', user_id: uid, title: 'Rutina', created_at: '2026-10-16', updated_at: '2026-10-16' },
    ]);
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    renderRouter(APP_DIR, { initialUrl: '/assistant' });
    expect(await screen.findByTestId('conv-c1')).toBeTruthy();
    await press(screen.getByTestId('delete-all-chats'));
    await waitFor(() => expect(fake.rows('ai_conversations')).toHaveLength(0));
    await waitFor(() => expect(screen.queryByTestId('conv-c1')).toBeNull());
  });
});
