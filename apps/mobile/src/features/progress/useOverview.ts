import { useHabitData, useToday } from '@/features/habits/api';
import { addDays } from '@/features/habits/logic';
import { useProfile, useUserTimeZone } from '@/features/profile/api';
import { useTasks } from '@/features/tasks/api';
import { useFitnessProfile, useSessions } from '@/features/training/api';
import { localDayKey } from '@/lib/dates';
import { useProgressCounts, useSyncAchievements } from './api';
import { bestStreak, DEFAULT_DISCIPLINE, disciplineScore, EMPTY_COUNTS, evaluateAchievements, levelFor, xpFrom } from './logic';

/** Disciplina, XP, nivel y logros a partir de los datos reales del usuario. */
export function useProgressOverview() {
  const tz = useUserTimeZone();
  const today = useToday();
  const profile = useProfile();
  const habits = useHabitData();
  const tasks = useTasks();
  const sessions = useSessions();
  const fitness = useFitnessProfile();
  const counts = useProgressCounts();
  const toLocalDay = (iso: string) => localDayKey(new Date(iso), tz);

  const c = counts.data ?? EMPTY_COUNTS;
  const xp = xpFrom(c);
  const level = levelFor(xp.total);
  const streak = bestStreak(habits.habits, habits.logs, habits.restDays, today);
  const achievements = evaluateAchievements({ ...c, best_streak: streak, level: level.level });
  const ready = !!counts.data && !habits.isLoading;
  const unlocked = useSyncAchievements(ready ? achievements.filter((a) => a.done).map((a) => a.code) : null);

  const from = addDays(today, -6);
  const workoutsLast7 = (sessions.data ?? []).filter((s) => s.finished_at && toLocalDay(s.started_at) >= from).length;
  const discipline = disciplineScore({
    config: profile.data?.discipline_config ?? DEFAULT_DISCIPLINE,
    habits: habits.habits,
    logs: habits.logs,
    restDays: habits.restDays,
    tasks: tasks.data ?? [],
    workoutsLast7,
    daysPerWeek: fitness.data?.days_per_week ?? null,
    today,
    toLocalDay,
  });

  return {
    isLoading: counts.isLoading || habits.isLoading,
    error: counts.error,
    counts: c,
    xp,
    level,
    streak,
    achievements: achievements.map((a) => ({ ...a, unlocked_at: unlocked.data?.find((u) => u.code === a.code)?.unlocked_at ?? null })),
    discipline,
  };
}
