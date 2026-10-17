import { MockProvider } from '../_shared/ai/mock.ts';
import { HttpError } from '../_shared/http.ts';
import { assert, assertEquals, assertRejects } from '../_shared/testing.ts';
import { toLocal } from './context.ts';
import { ChatRepo, handleChat, Privacy, Proposal, validateActions } from './handler.ts';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const OTHER = '99999999-9999-4999-8999-999999999999';

function repo(privacy: Privacy = { habits: true, planner: true, training: false, nutrition: true }) {
  const log = { messages: [] as [string, string][], proposals: [] as Proposal[], contextFor: null as Privacy | null, quota: 0 };
  const r: ChatRepo = {
    consumeQuota: async () => {
      log.quota++;
    },
    privacy: async () => privacy,
    conversation: async (id) => id ?? 'conv-1',
    history: async () => [{ role: 'user', text: 'antes' }],
    context: async (p) => {
      log.contextFor = p;
      return { today: '2026-10-16' };
    },
    pendingTaskIds: async (ids) => new Set(ids.filter((i) => i === T1 || i === T2)),
    addMessage: async (_c, role, content) => {
      log.messages.push([role, content]);
      return `m${log.messages.length}`;
    },
    addProposals: async (_m, ps) => {
      log.proposals.push(...ps);
      return ps.map((p, i) => ({ id: `p${i}`, ...p }));
    },
  };
  return { r, log };
}

Deno.test('responde, guarda ambos mensajes y usa solo el contexto permitido', async () => {
  const { r, log } = repo();
  const ai = new MockProvider();
  const out = await handleChat({ message: '¿Qué tengo hoy?' }, r, ai);
  assertEquals(out.conversation_id, 'conv-1');
  assertEquals(log.messages.map((m) => m[0]), ['user', 'assistant']);
  assertEquals(out.context_used, ['habits', 'planner', 'nutrition']);
  assertEquals(log.contextFor?.training, false);
  assertEquals(ai.calls[0].history, [{ role: 'user', text: 'antes' }]);
  assertEquals(log.quota, 1);
});

Deno.test('convierte las acciones en propuestas validadas, sin aplicar nada', async () => {
  const { r, log } = repo();
  const ai = new MockProvider({
    chat: () => ({
      reply: 'Te propongo esto.',
      actions: [
        { type: 'create_task', title: 'Estudiar redes', priority: 2, due_date: '2026-10-17', due_time: '18:00', description: null },
        { type: 'create_event', title: 'Gym', date: '2026-10-17', start_time: '07:00', end_time: '08:00' },
        { type: 'create_event', title: 'Mal', date: '2026-10-17', start_time: '09:00', end_time: '08:00' },
        { type: 'reschedule_tasks', task_ids: [T1, OTHER], due_date: '2026-10-18' },
        { type: 'complete_task', task_id: OTHER },
        { type: 'delete_everything' },
        { type: 'create_task', title: '' },
      ],
    }),
  });
  const out = await handleChat({ message: 'organiza mi semana' }, r, ai);
  assertEquals(log.proposals.map((p) => p.action_type), ['create_task', 'create_event', 'reschedule_tasks']);
  assertEquals(log.proposals[2].payload.task_ids, [T1]); // la tarea ajena se descarta
  assertEquals(out.proposals.length, 3);
  assertEquals(out.message.content, 'Te propongo esto.');
});

Deno.test('como mucho 5 propuestas por respuesta', async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ type: 'create_task', title: `t${i}` }));
  const ps = await validateActions(many, async () => new Set());
  assertEquals(ps.length, 5);
});

Deno.test('normaliza hábitos semanales y descarta diarios sin días', async () => {
  const ps = await validateActions(
    [
      { type: 'create_habit', name: 'Correr', frequency: 'weekly', target_per_period: 3, days_of_week: [1] },
      { type: 'create_habit', name: 'Leer', frequency: 'daily', days_of_week: [] },
      { type: 'create_habit', name: 'Agua', category: 'water' },
    ],
    async () => new Set(),
  );
  assertEquals(ps.map((p) => p.payload.name), ['Correr', 'Agua']);
  assertEquals(ps[0].payload.days_of_week, [0, 1, 2, 3, 4, 5, 6]);
  assertEquals(ps[1].payload.frequency, 'daily');
});

Deno.test('valida la entrada y no gasta cuota con mensajes vacíos', async () => {
  const { r, log } = repo();
  for (const body of [{ message: '   ' }, { message: 'x'.repeat(2001) }, { message: 'hola', conversation_id: 'no-uuid' }, null]) {
    const e = await assertRejects(() => handleChat(body, r, new MockProvider()), HttpError);
    assertEquals(e.code, 'invalid_input');
  }
  assertEquals(log.quota, 0);
});

Deno.test('una salida de IA inválida no guarda respuesta', async () => {
  const { r, log } = repo();
  const e = await assertRejects(() => handleChat({ message: 'hola' }, r, new MockProvider({ chat: () => ({ nope: 1 }) })), HttpError);
  assertEquals(e.code, 'ai_bad_output');
  assertEquals(log.messages.map((m) => m[0]), ['user']);
});

Deno.test('las fechas del contexto se muestran en la hora local del usuario', () => {
  assertEquals(toLocal('2026-10-16T03:30:00Z', 'America/Lima'), '2026-10-15 22:30');
  assert(toLocal('2026-03-29T01:30:00Z', 'Europe/Madrid').startsWith('2026-03-29 03:30'));
});
