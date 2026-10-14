import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, LoadingState, Notice, SectionHeader } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { useNow } from '@/hooks/useNow';
import { localDayKey } from '@/lib/dates';
import { spacing } from '@/theme';
import { useRescheduleTask, useSetTaskStatus, useTasks } from './api';
import { groupLabels, groupTasks, localTime, zonedToUtcIso } from './logic';
import { TaskRow } from './TaskRow';

const DONE_PREVIEW = 5;

export function TasksView() {
  const now = useNow();
  const tz = useUserTimeZone();
  const tasks = useTasks();
  const setStatus = useSetTaskStatus();
  const reschedule = useRescheduleTask();
  const [showAllDone, setShowAllDone] = useState(false);
  const [moving, setMoving] = useState(false);

  const groups = useMemo(() => groupTasks(tasks.data ?? [], now, tz), [tasks.data, now, tz]);

  if (tasks.isLoading) return <LoadingState label="Cargando tareas…" />;
  if (tasks.error && !tasks.data) {
    return <ErrorState message="No se pudieron cargar tus tareas. Revisa tu conexión." onRetry={() => tasks.refetch()} />;
  }

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="checkbox-outline"
          title="Sin tareas"
          description="Anota lo que tienes que hacer, con prioridad y fecha límite. Las atrasadas aparecerán primero."
          actionLabel="Nueva tarea"
          onAction={() => router.push('/task/new')}
          testID="planner-empty-tasks"
        />
      </Card>
    );
  }

  async function moveOverdueToToday(ids: string[]) {
    setMoving(true);
    const today = localDayKey(new Date(), tz);
    try {
      for (const id of ids) {
        const t = tasks.data?.find((x) => x.id === id);
        const time = t?.due_at ? localTime(t.due_at, tz) : '23:59';
        // Si la hora original de hoy ya pasó, se mueve al final del día.
        let due = zonedToUtcIso(today, time, tz);
        if (new Date(due).getTime() < Date.now()) due = zonedToUtcIso(today, '23:59', tz);
        await reschedule.reschedule(id, due);
      }
    } finally {
      setMoving(false);
    }
  }

  return (
    <View style={styles.list} testID="tasks-view">
      {setStatus.isError || reschedule.isError ? (
        <Notice tone="error" message="No se pudo guardar el último cambio. Inténtalo de nuevo." />
      ) : null}
      {groups.map((g) => {
        const visible = g.key === 'done' && !showAllDone ? g.tasks.slice(0, DONE_PREVIEW) : g.tasks;
        return (
          <View key={g.key} style={styles.group} testID={`task-group-${g.key}`}>
            <SectionHeader
              title={`${groupLabels[g.key]} · ${g.tasks.length}`}
              actionLabel={g.key === 'overdue' ? 'Mover a hoy' : undefined}
              onAction={g.key === 'overdue' && !moving ? () => moveOverdueToToday(g.tasks.map((t) => t.id)) : undefined}
            />
            <Card>
              {visible.map((task, i) => (
                <TaskRow
                  key={task.id}
                  first={i === 0}
                  task={task}
                  now={now}
                  timeZone={tz}
                  onToggle={() => setStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
                  onOpen={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
                />
              ))}
              {g.key === 'done' && g.tasks.length > DONE_PREVIEW ? (
                <Button
                  label={showAllDone ? 'Ver menos' : `Ver las ${g.tasks.length}`}
                  variant="ghost"
                  onPress={() => setShowAllDone((v) => !v)}
                />
              ) : null}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  group: { gap: spacing.sm },
});
