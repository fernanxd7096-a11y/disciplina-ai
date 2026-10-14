import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useEvents, useNotificationPrefs, useReminders } from '@/features/events/api';
import { useHabitData } from '@/features/habits/api';
import { useUserTimeZone } from '@/features/profile/api';
import { useTasks } from '@/features/tasks/api';
import { applyPlan, configureNotifications, getPermission, type PermissionState } from './notifications';
import { desiredNotifications } from './plan';

/**
 * Mantiene los avisos del teléfono en sintonía con los datos:
 * se recalcula al cambiar eventos, tareas, hábitos o preferencias,
 * y al volver la app al primer plano (por si cambió el día o la hora).
 */
export function useNotificationSync(): { permission: PermissionState | null } {
  const tz = useUserTimeZone();
  const events = useEvents();
  const reminders = useReminders();
  const tasks = useTasks();
  const prefs = useNotificationPrefs();
  const habits = useHabitData();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [tick, setTick] = useState(0);
  const running = useRef<Promise<unknown> | null>(null);

  const ready = events.isSuccess && reminders.isSuccess && tasks.isSuccess && prefs.isSuccess && !habits.isLoading;

  const plan = useMemo(() => {
    if (!ready) return null;
    return desiredNotifications({
      now: new Date(),
      timeZone: tz,
      events: events.data ?? [],
      reminders: reminders.data ?? [],
      tasks: tasks.data ?? [],
      habits: habits.habits,
      habitLogs: habits.logs,
      restDays: habits.restDays,
      prefs: prefs.data!,
    });
    // tick fuerza recálculo al volver al primer plano
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tz, events.data, reminders.data, tasks.data, habits.habits, habits.logs, habits.restDays, prefs.data, tick]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((t) => t + 1));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    const run = async () => {
      if (running.current) await running.current.catch(() => {});
      await configureNotifications();
      const p = await getPermission();
      if (cancelled) return;
      setPermission(p);
      if (p !== 'granted') return;
      await applyPlan(plan);
    };
    running.current = run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [plan]);

  // Tocar una notificación abre la pantalla correspondiente.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    });
    return () => sub.remove();
  }, []);

  return { permission };
}
