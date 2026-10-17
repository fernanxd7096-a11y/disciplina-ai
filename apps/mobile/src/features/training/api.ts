import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { invokeAI } from '@/lib/ai';
import type { Exercise, FitnessProfile, FitnessProfileInput, PlanDraft, PlanExercise, SetLog, WorkoutPlan, WorkoutSession } from './types';

const EXERCISE_COLS = 'id, owner_id, code, name_es, muscle_group, equipment, level, instructions, common_mistakes';
const PLAN_COLS = 'id, user_id, name, source, day_labels, notes, active, created_at';
const PE_COLS = 'id, plan_id, day_index, exercise_id, sets, reps_min, reps_max, rest_seconds, suggested_kg, sort_order';
const SESSION_COLS = 'id, user_id, plan_id, day_index, title, started_at, finished_at, perceived_effort, notes';
const SET_COLS = 'id, session_id, exercise_id, set_number, reps, weight_kg, created_at';

/** Historial de entrenamiento que se carga (para progreso y estadísticas). */
export const TRAINING_HISTORY_DAYS = 180;

export const trainingKeys = {
  profile: (uid: string) => ['fitnessProfile', uid] as const,
  exercises: (uid: string) => ['exercises', uid] as const,
  plan: (uid: string) => ['activePlan', uid] as const,
  sessions: (uid: string) => ['workoutSessions', uid] as const,
  sets: (uid: string) => ['setLogs', uid] as const,
};

export function useFitnessProfile() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: trainingKeys.profile(user.id),
    queryFn: async (): Promise<FitnessProfile | null> => {
      const { data, error } = await client
        .from('fitness_profiles')
        .select('user_id, goal, experience, days_per_week, minutes_per_session, equipment, limitations')
        .maybeSingle();
      if (error) throw error;
      return (data as FitnessProfile | null) ?? null;
    },
  });
}

export function useSaveFitnessProfile() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FitnessProfileInput) => {
      const { data, error } = await client
        .from('fitness_profiles')
        .upsert({ ...input, user_id: user.id, limitations: input.limitations?.trim() || null }, { onConflict: 'user_id' })
        .select('user_id, goal, experience, days_per_week, minutes_per_session, equipment, limitations')
        .single();
      if (error) throw error;
      return data as FitnessProfile;
    },
    onSuccess: (p) => qc.setQueryData(trainingKeys.profile(user.id), p),
  });
}

export function useExercises() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: trainingKeys.exercises(user.id),
    staleTime: 24 * 3_600_000,
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await client.from('exercises').select(EXERCISE_COLS).order('name_es');
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
  });
}

export type ActivePlan = { plan: WorkoutPlan; items: PlanExercise[] } | null;

export function useActivePlan() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: trainingKeys.plan(user.id),
    queryFn: async (): Promise<ActivePlan> => {
      const { data: plan, error } = await client.from('workout_plans').select(PLAN_COLS).eq('active', true).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!plan) return null;
      const { data: items, error: e2 } = await client.from('plan_exercises').select(PE_COLS).eq('plan_id', plan.id).order('day_index').order('sort_order');
      if (e2) throw e2;
      return {
        plan: plan as WorkoutPlan,
        items: ((items ?? []) as PlanExercise[]).map((i) => ({ ...i, suggested_kg: i.suggested_kg == null ? null : Number(i.suggested_kg) })),
      };
    },
  });
}

/** Guarda una rutina nueva como activa (la anterior queda en el historial, inactiva). */
export function useSavePlan() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: PlanDraft) => {
      const { error: e0 } = await client.from('workout_plans').update({ active: false }).eq('active', true);
      if (e0) throw e0;
      const notes = [draft.notes, ...draft.safety_notes.map((s) => `⚠ ${s}`)].filter(Boolean).join('\n').slice(0, 2000) || null;
      const { data: plan, error } = await client
        .from('workout_plans')
        .insert({ name: draft.name.slice(0, 80), source: draft.source, day_labels: draft.day_labels, notes, active: true })
        .select(PLAN_COLS)
        .single();
      if (error) throw error;
      const { error: e2 } = await client.from('plan_exercises').insert(draft.items.map((i) => ({ ...i, plan_id: (plan as WorkoutPlan).id })));
      if (e2) {
        // Sin ejercicios la rutina no sirve: se elimina para no dejarla a medias.
        await client.from('workout_plans').delete().eq('id', (plan as WorkoutPlan).id);
        throw e2;
      }
      return plan as WorkoutPlan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.plan(user.id) }),
  });
}

export function useDeactivatePlan() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await client.from('workout_plans').update({ active: false }).eq('id', planId);
      if (error) throw error;
    },
    onSuccess: () => qc.setQueryData(trainingKeys.plan(user.id), null),
  });
}

/** Propuesta de la IA (no se guarda hasta que el usuario la acepta). */
export function useAIPlan() {
  const { client } = useSessionClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      const r = await invokeAI<{ provider: string; model: string; plan: Omit<PlanDraft, 'source'> }>(client, 'workout-plan', note ? { note } : {});
      return { provider: r.provider, draft: { ...r.plan, source: 'ai' as const } };
    },
  });
}

export function useSessions() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: trainingKeys.sessions(user.id),
    queryFn: async (): Promise<WorkoutSession[]> => {
      const since = new Date(Date.now() - TRAINING_HISTORY_DAYS * 86_400_000).toISOString();
      const { data, error } = await client
        .from('workout_sessions')
        .select(SESSION_COLS)
        .is('deleted_at', null)
        .gte('started_at', since)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutSession[];
    },
  });
}

export function useSetLogs() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: trainingKeys.sets(user.id),
    queryFn: async (): Promise<SetLog[]> => {
      const since = new Date(Date.now() - TRAINING_HISTORY_DAYS * 86_400_000).toISOString();
      const { data, error } = await client.from('set_logs').select(SET_COLS).gte('created_at', since);
      if (error) throw error;
      return ((data ?? []) as SetLog[]).map((s) => ({ ...s, weight_kg: Number(s.weight_kg) }));
    },
  });
}

export function useStartSession() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { plan_id: string | null; day_index: number | null; title: string }) => {
      const { data, error } = await client
        .from('workout_sessions')
        .insert({ ...input, started_at: new Date().toISOString() })
        .select(SESSION_COLS)
        .single();
      if (error) throw error;
      return data as WorkoutSession;
    },
    onSuccess: (s) => qc.setQueryData<WorkoutSession[]>(trainingKeys.sessions(user.id), (old = []) => [s, ...old]),
  });
}

/** Registra (o corrige) una serie. Optimista para que marcar series sea instantáneo. */
export function useLogSet() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const key = trainingKeys.sets(user.id);
  return useMutation({
    scope: { id: `set-logs-${user.id}` },
    mutationFn: async (s: { session_id: string; exercise_id: string; set_number: number; reps: number; weight_kg: number }) => {
      const { data, error } = await client
        .from('set_logs')
        .upsert(s, { onConflict: 'session_id,exercise_id,set_number' })
        .select(SET_COLS)
        .single();
      if (error) throw error;
      return { ...(data as SetLog), weight_kg: Number((data as SetLog).weight_kg) };
    },
    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SetLog[]>(key) ?? [];
      const same = (x: SetLog) => x.session_id === s.session_id && x.exercise_id === s.exercise_id && x.set_number === s.set_number;
      const existing = prev.find(same);
      const next = existing ? prev.map((x) => (same(x) ? { ...x, ...s } : x)) : [...prev, { id: `tmp-${Date.now()}`, created_at: new Date().toISOString(), ...s }];
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_e, _s, ctx) => ctx && qc.setQueryData(key, ctx.prev),
    onSuccess: (row) =>
      qc.setQueryData<SetLog[]>(key, (old = []) => [
        ...old.filter((x) => !(x.session_id === row.session_id && x.exercise_id === row.exercise_id && x.set_number === row.set_number)),
        row,
      ]),
  });
}

export function useDeleteSet() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `set-logs-${user.id}` },
    mutationFn: async (s: { session_id: string; exercise_id: string; set_number: number }) => {
      const { error } = await client.from('set_logs').delete().eq('session_id', s.session_id).eq('exercise_id', s.exercise_id).eq('set_number', s.set_number);
      if (error) throw error;
      return s;
    },
    onSuccess: (s) =>
      qc.setQueryData<SetLog[]>(trainingKeys.sets(user.id), (old = []) =>
        old.filter((x) => !(x.session_id === s.session_id && x.exercise_id === s.exercise_id && x.set_number === s.set_number)),
      ),
  });
}

export function useFinishSession() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, perceived_effort, notes }: { id: string; perceived_effort: number | null; notes: string | null }) => {
      const { data, error } = await client
        .from('workout_sessions')
        .update({ finished_at: new Date().toISOString(), perceived_effort, notes: notes?.trim() || null })
        .eq('id', id)
        .select(SESSION_COLS)
        .single();
      if (error) throw error;
      return data as WorkoutSession;
    },
    onSuccess: (s) => qc.setQueryData<WorkoutSession[]>(trainingKeys.sessions(user.id), (old = []) => old.map((x) => (x.id === s.id ? s : x))),
  });
}

export function useDeleteSession() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('workout_sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.setQueryData<WorkoutSession[]>(trainingKeys.sessions(user.id), (old = []) => old.filter((x) => x.id !== id)),
  });
}
