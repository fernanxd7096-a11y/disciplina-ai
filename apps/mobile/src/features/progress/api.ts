import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { EMPTY_COUNTS, type ProgressCounts } from './logic';

export const progressKeys = {
  counts: (uid: string) => ['progressCounts', uid] as const,
  achievements: (uid: string) => ['achievements', uid] as const,
};

export function useProgressCounts() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: progressKeys.counts(user.id),
    queryFn: async (): Promise<ProgressCounts> => {
      const { data, error } = await client.rpc('my_progress_counts');
      if (error) throw error;
      const d = (data ?? {}) as Partial<Record<keyof ProgressCounts, number | string>>;
      return Object.fromEntries(Object.keys(EMPTY_COUNTS).map((k) => [k, Number(d[k as keyof ProgressCounts] ?? 0)])) as ProgressCounts;
    },
  });
}

export type UnlockedAchievement = { code: string; unlocked_at: string };

export function useUnlockedAchievements() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: progressKeys.achievements(user.id),
    queryFn: async (): Promise<UnlockedAchievement[]> => {
      const { data, error } = await client.from('user_achievements').select('code, unlocked_at');
      if (error) throw error;
      return (data ?? []) as UnlockedAchievement[];
    },
  });
}

/** Guarda la fecha de desbloqueo de los logros recién cumplidos (una sola vez cada uno). */
export function useSyncAchievements(doneCodes: string[] | null) {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const unlocked = useUnlockedAchievements();
  const save = useMutation({
    mutationFn: async (codes: string[]) => {
      const { error } = await client.from('user_achievements').upsert(codes.map((code) => ({ code })), { onConflict: 'user_id,code', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.achievements(user.id) }),
  });
  const known = unlocked.data;
  const missing = doneCodes && known ? doneCodes.filter((c) => !known.some((k) => k.code === c)) : [];
  const key = missing.join(',');
  const { mutate, isPending } = save;
  // Un intento por conjunto de logros: si falla (sin red), no reintenta en bucle.
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (key && !isPending && !tried.current.has(key)) {
      tried.current.add(key);
      mutate(key.split(','));
    }
  }, [key, isPending, mutate]);
  return unlocked;
}

/** Fechas de tareas completadas (para estadísticas de hasta 90 días). */
export function useCompletedTasks(days: number) {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: ['completedTasks', user.id, days],
    queryFn: async (): Promise<{ completed_at: string; due_at: string | null }[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await client.from('tasks').select('completed_at, due_at').eq('status', 'done').gte('completed_at', since).is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as { completed_at: string; due_at: string | null }[];
    },
  });
}
