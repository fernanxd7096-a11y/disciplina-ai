import { MockProvider } from '../_shared/ai/mock.ts';
import { HttpError } from '../_shared/http.ts';
import { assert, assertEquals, assertRejects } from '../_shared/testing.ts';
import { CatalogExercise, estimateMinutes, FitnessProfile, handleWorkoutPlan, WorkoutPlanRepo } from './handler.ts';

const CATALOG: CatalogExercise[] = [
  { id: 'e1', code: 'push_up', name_es: 'Flexiones', muscle_group: 'chest', equipment: 'bodyweight', level: 'beginner' },
  { id: 'e2', code: 'squat', name_es: 'Sentadilla', muscle_group: 'legs', equipment: 'bodyweight', level: 'beginner' },
  { id: 'e3', code: 'pull_up', name_es: 'Dominadas', muscle_group: 'back', equipment: 'pullup_bar', level: 'intermediate' },
  { id: 'e4', code: 'plank', name_es: 'Plancha', muscle_group: 'core', equipment: 'bodyweight', level: 'beginner' },
  { id: 'e5', code: 'bicep_curl', name_es: 'Curl', muscle_group: 'arms', equipment: 'dumbbells', level: 'beginner' },
  { id: 'e6', code: 'lunge', name_es: 'Zancadas', muscle_group: 'legs', equipment: 'bodyweight', level: 'beginner' },
];

const PROFILE: FitnessProfile = {
  goal: 'gain_muscle', experience: 'beginner', days_per_week: 3, minutes_per_session: 45, equipment: ['pullup_bar'], limitations: null,
};

function repo(over: Partial<WorkoutPlanRepo> = {}) {
  let quota = 0;
  const r: WorkoutPlanRepo = {
    consumeQuota: async () => {
      quota++;
    },
    fitnessProfile: async () => PROFILE,
    catalog: async () => CATALOG,
    history: async () => ({ age: 25, height_cm: 175, weight_kg: 78, recent_sessions: [], best_sets: [] }),
    ...over,
  };
  return { r, quota: () => quota };
}

const day = (label: string, codes: string[], extra: Record<string, unknown> = {}) => ({
  label,
  exercises: codes.map((code) => ({ code, sets: 3, reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null, ...extra })),
});

Deno.test('genera una rutina con los días pedidos y solo ejercicios disponibles', async () => {
  const { r, quota } = repo();
  const ai = new MockProvider({
    plan: () => ({
      name: 'Base 3 días',
      notes: 'Progresa de a poco.',
      safety_notes: [],
      days: [day('A', ['push_up', 'squat', 'bicep_curl']), day('B', ['pull_up', 'lunge', 'inventado']), day('C', ['plank', 'squat']), day('D', ['plank', 'squat'])],
    }),
  });
  const { plan, provider } = await handleWorkoutPlan({}, r, ai);
  assertEquals(provider, 'mock');
  assertEquals(plan.day_labels, ['A', 'B', 'C']); // el cuarto día sobra: máximo days_per_week
  const ids = plan.items.map((i) => i.exercise_id);
  assert(!ids.includes('e5'), 'sin mancuernas no se propone curl');
  assertEquals(plan.items.filter((i) => i.day_index === 1).map((i) => i.exercise_id), ['e3', 'e6']); // el inventado se descarta
  assertEquals(quota(), 1);
});

Deno.test('acota series, repeticiones y descansos y respeta el tiempo de sesión', async () => {
  const { r } = repo();
  const many = ['push_up', 'squat', 'pull_up', 'plank', 'lunge'];
  const ai = new MockProvider({
    plan: () => ({ name: 'x', notes: '', safety_notes: [], days: [0, 1, 2].map((i) => day(`D${i}`, many, { sets: 20, reps_min: 50, reps_max: 3, rest_seconds: 999, suggested_kg: 40 })) }),
  });
  const { plan } = await handleWorkoutPlan({}, r, ai);
  for (const i of plan.items) {
    assertEquals([i.sets, i.reps_min, i.reps_max, i.rest_seconds], [6, 30, 30, 300]);
    assertEquals(i.suggested_kg, null); // sin carga sugerida en ejercicios con peso corporal
  }
  for (const d of [0, 1, 2]) {
    const items = plan.items.filter((i) => i.day_index === d);
    assert(items.length >= 2);
    assert(items.length === 2 || estimateMinutes(items) <= 45 * 1.2);
  }
});

Deno.test('sin perfil no gasta cuota y pide completarlo', async () => {
  const { r, quota } = repo({ fitnessProfile: async () => null });
  const e = await assertRejects(() => handleWorkoutPlan({}, r, new MockProvider()), HttpError);
  assertEquals(e.code, 'missing_profile');
  assertEquals(quota(), 0);
});

Deno.test('si la IA no completa los días es un error controlado', async () => {
  const { r } = repo();
  const ai = new MockProvider({ plan: () => ({ name: 'x', notes: '', safety_notes: [], days: [day('A', ['push_up', 'squat'])] }) });
  const e = await assertRejects(() => handleWorkoutPlan({}, r, ai), HttpError);
  assertEquals(e.code, 'ai_bad_output');
});

Deno.test('el modo prueba genera una rutina usable con el catálogo real', async () => {
  const { r } = repo();
  const { plan } = await handleWorkoutPlan({ note: 'quiero más espalda' }, r, new MockProvider());
  assertEquals(plan.day_labels.length, 3);
  assert(plan.items.length >= 6);
});

Deno.test('rechaza notas demasiado largas', async () => {
  const { r } = repo();
  const e = await assertRejects(() => handleWorkoutPlan({ note: 'x'.repeat(301) }, r, new MockProvider()), HttpError);
  assertEquals(e.code, 'invalid_input');
});
