import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { eventKeys } from '@/features/events/api';
import type { Reminder } from '@/features/events/types';
import type { Task, TaskInput, TaskStatus } from './types';

const TASK_COLS =
  'id, user_id, title, description, priority, due_at, status, completed_at, rescheduled_count, category_id, created_at, updated_at, deleted_at';

export const taskKeys = { all: (uid: string) => ['tasks', uid] as const };

/** Tareas pendientes y las completadas en los últimos 30 días. */
export function useTasks() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: taskKeys.all(user.id),
    queryFn: async (): Promise<Task[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await client
        .from('tasks')
        .select(TASK_COLS)
        .is('deleted_at', null)
        .or(`status.neq.done,completed_at.gte.${since}`)
        .order('due_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

function useTaskCache() {
  const { user } = useSessionClient();
  const qc = useQueryClient();
  const key = taskKeys.all(user.id);
  return {
    qc,
    key,
    get: () => qc.getQueryData<Task[]>(key) ?? [],
    replace: (task: Task) => qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === task.id ? task : t))),
    patch: (id: string, patch: Partial<Task>) =>
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === id ? { ...t, ...patch } : t))),
  };
}

export function useCreateTask() {
  const { client } = useSessionClient();
  const cache = useTaskCache();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const { data, error } = await client
        .from('tasks')
        .insert({ ...input, title: input.title.trim(), description: input.description?.trim() || null })
        .select(TASK_COLS)
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => cache.qc.setQueryData<Task[]>(cache.key, (old = []) => [...old, task]),
  });
}

export function useUpdateTask() {
  const { client } = useSessionClient();
  const cache = useTaskCache();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TaskInput> & { rescheduled_count?: number; category_id?: string | null } }) => {
      const clean = { ...patch };
      if (clean.title !== undefined) clean.title = clean.title.trim();
      if (clean.description !== undefined) clean.description = clean.description?.trim() || null;
      const { data, error } = await client.from('tasks').update(clean).eq('id', id).select(TASK_COLS).single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: cache.replace,
  });
}

/** Completar / reabrir con respuesta inmediata; se revierte si falla. */
export function useSetTaskStatus() {
  const { client } = useSessionClient();
  const cache = useTaskCache();
  return useMutation({
    scope: { id: 'task-status' },
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const patch = { status, completed_at: status === 'done' ? new Date().toISOString() : null };
      const { data, error } = await client.from('tasks').update(patch).eq('id', id).select(TASK_COLS).single();
      if (error) throw error;
      return data as Task;
    },
    onMutate: ({ id, status }) => {
      const previous = cache.get().find((t) => t.id === id);
      cache.patch(id, { status, completed_at: status === 'done' ? new Date().toISOString() : null });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) cache.replace(ctx.previous);
    },
    onSuccess: cache.replace,
  });
}

/** Mover la fecha límite, contando cuántas veces se reprogramó. */
export function useRescheduleTask() {
  const update = useUpdateTask();
  const cache = useTaskCache();
  return {
    ...update,
    reschedule: (id: string, dueAt: string | null) => {
      const current = cache.get().find((t) => t.id === id);
      return update.mutateAsync({
        id,
        patch: { due_at: dueAt, rescheduled_count: (current?.rescheduled_count ?? 0) + (current?.due_at ? 1 : 0) },
      });
    },
  };
}

export function useDeleteTask() {
  const { client } = useSessionClient();
  const cache = useTaskCache();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => cache.qc.setQueryData<Task[]>(cache.key, (old = []) => old.filter((t) => t.id !== id)),
  });
}

/** Avisos de una tarea (minutos antes de la fecha límite). Sincroniza con lo guardado. */
export function useSaveTaskReminders() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, offsets }: { taskId: string; offsets: number[] }) => {
      const saved = (qc.getQueryData<Reminder[]>(eventKeys.reminders(user.id)) ?? []).filter((r) => r.task_id === taskId && r.offset_minutes != null);
      const remove = saved.filter((r) => !offsets.includes(r.offset_minutes!));
      const add = offsets.filter((o) => !saved.some((r) => r.offset_minutes === o));
      if (remove.length) {
        const { error } = await client.from('reminders').delete().in('id', remove.map((r) => r.id));
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await client.from('reminders').insert(add.map((o) => ({ task_id: taskId, offset_minutes: o })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: eventKeys.reminders(user.id) }),
  });
}
