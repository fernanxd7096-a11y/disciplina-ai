import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { addDays, nextValue } from './logic';
import type { Habit, HabitInput, HabitLog, HabitStatus, RestDay } from './types';

/** Historial que se carga para rachas y estadísticas. */
export const HISTORY_DAYS = 400;

const HABIT_COLS =
  'id, user_id, name, icon, color, category, frequency, days_of_week, target_per_period, unit, reminder_time, status, start_date, sort_order, created_at, updated_at, deleted_at';

export const habitKeys = {
  all: (uid: string) => ['habits', uid] as const,
  logs: (uid: string) => ['habitLogs', uid] as const,
  rest: (uid: string) => ['restDays', uid] as const,
};

/** Día local de hoy en la zona del perfil. */
export function useToday(now: Date = new Date()): string {
  const tz = useUserTimeZone();
  return localDayKey(now, tz);
}

export function useHabits() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: habitKeys.all(user.id),
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await client
        .from('habits')
        .select(HABIT_COLS)
        .is('deleted_at', null)
        .neq('status', 'archived')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Habit[];
    },
  });
}

export function useHabitLogs() {
  const { client, user } = useSessionClient();
  const today = useToday();
  return useQuery({
    queryKey: habitKeys.logs(user.id),
    queryFn: async (): Promise<HabitLog[]> => {
      const { data, error } = await client
        .from('habit_logs')
        .select('id, user_id, habit_id, log_date, value, note')
        .gte('log_date', addDays(today, -HISTORY_DAYS))
        .is('deleted_at', null);
      if (error) throw error;
      return ((data ?? []) as HabitLog[]).map((l) => ({ ...l, value: Number(l.value) }));
    },
  });
}

export function useRestDays() {
  const { client, user } = useSessionClient();
  const today = useToday();
  return useQuery({
    queryKey: habitKeys.rest(user.id),
    queryFn: async (): Promise<RestDay[]> => {
      const { data, error } = await client
        .from('rest_days')
        .select('id, user_id, date, reason')
        .gte('date', addDays(today, -HISTORY_DAYS))
        .is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as RestDay[];
    },
  });
}

/** Datos combinados para pantallas de hábitos. */
export function useHabitData() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const rest = useRestDays();
  return {
    habits: habits.data ?? [],
    logs: logs.data ?? [],
    restDays: (rest.data ?? []).map((r) => r.date),
    restRows: rest.data ?? [],
    isLoading: habits.isLoading || logs.isLoading || rest.isLoading,
    error: habits.error ?? logs.error ?? rest.error,
    refetch: () => Promise.all([habits.refetch(), logs.refetch(), rest.refetch()]),
    isRefetching: habits.isRefetching || logs.isRefetching || rest.isRefetching,
  };
}

export function useCreateHabit() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const today = useToday();
  return useMutation({
    mutationFn: async (input: HabitInput) => {
      const current = qc.getQueryData<Habit[]>(habitKeys.all(user.id)) ?? [];
      const { data, error } = await client
        .from('habits')
        .insert({
          ...input,
          name: input.name.trim(),
          start_date: today,
          sort_order: current.length,
        })
        .select(HABIT_COLS)
        .single();
      if (error) throw error;
      return data as Habit;
    },
    onSuccess: (habit) => {
      qc.setQueryData<Habit[]>(habitKeys.all(user.id), (old = []) => [...old, habit]);
    },
  });
}

export function useUpdateHabit() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HabitInput> & { status?: HabitStatus } }) => {
      const { data, error } = await client
        .from('habits')
        .update(patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch)
        .eq('id', id)
        .select(HABIT_COLS)
        .single();
      if (error) throw error;
      return data as Habit;
    },
    onSuccess: (habit) => {
      qc.setQueryData<Habit[]>(habitKeys.all(user.id), (old = []) => old.map((h) => (h.id === habit.id ? habit : h)));
    },
  });
}

/** Borrado lógico: el historial queda en la base pero el hábito desaparece de la app. */
export function useDeleteHabit() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('habits').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<Habit[]>(habitKeys.all(user.id), (old = []) => old.filter((h) => h.id !== id));
    },
  });
}

type SetValueVars = { habitId: string; date: string; value: number; previousValue: number };

/**
 * Marcar / sumar en un hábito para un día.
 *
 * - La UI se actualiza al instante y de forma síncrona, así dos toques rápidos
 *   calculan 1 → 2 y no 1 → 1.
 * - Las escrituras se envían en orden (scope compartido): la última siempre gana.
 * - Si una escritura falla, solo ese día de ese hábito vuelve a su valor anterior.
 */
export function useHabitStepper() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const key = habitKeys.logs(user.id);

  const setLocal = useCallback(
    (habitId: string, date: string, value: number, id?: string) => {
      qc.setQueryData<HabitLog[]>(key, (old = []) => {
        const rest = old.filter((l) => !(l.habit_id === habitId && l.log_date === date));
        if (value <= 0) return rest;
        return [...rest, { id: id ?? `tmp-${habitId}-${date}`, user_id: user.id, habit_id: habitId, log_date: date, value, note: null }];
      });
    },
    [qc, key, user.id],
  );

  const mutation = useMutation({
    scope: { id: `habit-logs-${user.id}` },
    mutationFn: async ({ habitId, date, value }: SetValueVars) => {
      if (value <= 0) {
        const { error } = await client.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', date);
        if (error) throw error;
        return null;
      }
      const { data, error } = await client
        .from('habit_logs')
        .upsert({ habit_id: habitId, log_date: date, value, deleted_at: null }, { onConflict: 'habit_id,log_date' })
        .select('id, user_id, habit_id, log_date, value, note')
        .single();
      if (error) throw error;
      return data as HabitLog;
    },
    onError: (_e, { habitId, date, previousValue }) => setLocal(habitId, date, previousValue),
    onSuccess: (saved, { habitId, date, value }) => {
      if (!saved) return;
      // Solo se reemplaza el valor temporal si no hubo otro toque después.
      const current = qc.getQueryData<HabitLog[]>(key)?.find((l) => l.habit_id === habitId && l.log_date === date);
      if (current && current.value === value) setLocal(habitId, date, Number(saved.value), saved.id);
    },
  });

  const valueOf = useCallback(
    (habitId: string, date: string) =>
      qc.getQueryData<HabitLog[]>(key)?.find((l) => l.habit_id === habitId && l.log_date === date)?.value ?? 0,
    [qc, key],
  );

  /** Siguiente paso según el tipo de hábito (check o contador). */
  const step = useCallback(
    (habit: Pick<Habit, 'id' | 'frequency' | 'target_per_period'>, date: string) => {
      const previousValue = valueOf(habit.id, date);
      const value = nextValue(habit, previousValue);
      void qc.cancelQueries({ queryKey: key });
      setLocal(habit.id, date, value);
      mutation.mutate({ habitId: habit.id, date, value, previousValue });
    },
    [valueOf, qc, key, setLocal, mutation],
  );

  return { step, isError: mutation.isError, isPending: mutation.isPending };
}

export function useToggleRestDay() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, rest }: { date: string; rest: boolean }) => {
      if (rest) {
        const { error } = await client
          .from('rest_days')
          .upsert({ date, deleted_at: null }, { onConflict: 'user_id,date' });
        if (error) throw error;
      } else {
        const { error } = await client.from('rest_days').delete().eq('date', date);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: habitKeys.rest(user.id) }),
  });
}
