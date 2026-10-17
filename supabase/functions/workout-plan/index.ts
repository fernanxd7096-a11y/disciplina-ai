// POST { note? } → propuesta de rutina personalizada. No guarda nada: la app la muestra y el usuario decide.
import { dailyLimit, getProvider } from '../_shared/ai/provider.ts';
import { consumeQuota, serveUser } from '../_shared/serve.ts';
import { CatalogExercise, FitnessProfile, handleWorkoutPlan } from './handler.ts';

const yearsSince = (d: string | null) =>
  d ? Math.floor((Date.now() - new Date(`${d}T00:00:00Z`).getTime()) / (365.25 * 86_400_000)) : null;

export default serveUser((body, { supabase }) =>
  handleWorkoutPlan(
    body,
    {
      consumeQuota: () => consumeQuota(supabase, 'plan', dailyLimit(Deno.env, 'plan')),
      fitnessProfile: async () => {
        const { data, error } = await supabase
          .from('fitness_profiles')
          .select('goal, experience, days_per_week, minutes_per_session, equipment, limitations')
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as FitnessProfile | null;
      },
      catalog: async () => {
        const { data, error } = await supabase.from('exercises').select('id, code, name_es, muscle_group, equipment, level');
        if (error) throw new Error(error.message);
        return (data ?? []) as CatalogExercise[];
      },
      history: async () => {
        const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
        const [profile, weight, sessions, sets] = await Promise.all([
          supabase.from('profiles').select('birth_date, height_cm').maybeSingle(),
          supabase.from('weight_logs').select('weight_kg').order('measured_on', { ascending: false }).limit(1).maybeSingle(),
          supabase
            .from('workout_sessions')
            .select('started_at, title, perceived_effort')
            .not('finished_at', 'is', null)
            .is('deleted_at', null)
            .order('started_at', { ascending: false })
            .limit(10),
          supabase
            .from('set_logs')
            .select('reps, weight_kg, exercise:exercises(id, code)')
            .gte('created_at', since)
            .limit(500),
        ]);
        const best = new Map<string, { reps: number; weight_kg: number }>();
        for (const s of (sets.data ?? []) as unknown as { reps: number; weight_kg: number; exercise: { id: string; code: string | null } }[]) {
          const key = s.exercise.code ?? s.exercise.id;
          const prev = best.get(key);
          if (!prev || s.weight_kg > prev.weight_kg || (s.weight_kg === prev.weight_kg && s.reps > prev.reps)) {
            best.set(key, { reps: s.reps, weight_kg: Number(s.weight_kg) });
          }
        }
        return {
          age: yearsSince(profile.data?.birth_date ?? null),
          height_cm: profile.data?.height_cm ? Number(profile.data.height_cm) : null,
          weight_kg: weight.data?.weight_kg ? Number(weight.data.weight_kg) : null,
          recent_sessions: (sessions.data ?? []).map((s) => ({
            date: String(s.started_at).slice(0, 10),
            title: s.title as string,
            perceived_effort: s.perceived_effort as number | null,
          })),
          best_sets: [...best].map(([exercise_key, v]) => ({ exercise_key, ...v })),
        };
      },
    },
    getProvider(Deno.env),
  ),
);
