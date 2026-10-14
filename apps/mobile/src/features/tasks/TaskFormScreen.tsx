import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Badge, Button, Chip, DateTimeField, Notice, Screen, Text, TextField } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { validate, type FieldErrors } from '@/lib/validation';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { spacing } from '@/theme';
import { useCreateTask, useDeleteTask, useRescheduleTask, useSetTaskStatus, useUpdateTask } from './api';
import { dueLabel, localTime, priorityMeta, quickDue, zonedToUtcIso, type QuickDue } from './logic';
import type { Task, TaskPriority } from './types';

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Escribe qué tienes que hacer.').max(200, 'Máximo 200 caracteres.'),
  description: z.string().max(4000, 'Máximo 4000 caracteres.'),
});

type Values = { title: string; description: string; priority: TaskPriority; due_at: string | null };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/planner');
}

function confirmDelete(): Promise<boolean> {
  const msg = 'La tarea desaparecerá de tu lista.';
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Eliminar tarea', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

const quickOptions: { key: QuickDue | 'none'; label: string }[] = [
  { key: 'none', label: 'Sin fecha' },
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'nextWeek', label: 'Próx. semana' },
];

export function TaskFormScreen({ task }: { task?: Task }) {
  const online = useIsOnline();
  const [offlineTried, setOfflineTried] = useState(false);
  const tz = useUserTimeZone();
  const [values, setValues] = useState<Values>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 3,
    due_at: task?.due_at ?? null,
  });
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const create = useCreateTask();
  const update = useUpdateTask();
  const reschedule = useRescheduleTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();
  const saving = create.isPending || update.isPending || reschedule.isPending;
  const failed = create.isError || update.isError || reschedule.isError || remove.isError;
  const now = new Date();

  const dueChanged = task ? task.due_at !== values.due_at : false;
  const display = values.due_at
    ? {
        date: new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })
          .format(new Date(values.due_at))
          .replace(/[.,]/g, ''),
        time: localTime(values.due_at, tz),
      }
    : null;

  function pickQuick(key: QuickDue | 'none') {
    const time = values.due_at ? localTime(values.due_at, tz) : '23:59';
    setValues((v) => ({ ...v, due_at: key === 'none' ? null : quickDue(key, new Date(), tz, time) }));
  }

  async function save() {
    if (!online) {
      setOfflineTried(true);
      return;
    }
    setOfflineTried(false);
    const { data, errors: e } = validate(taskSchema, values);
    setErrors(e);
    if (!data) return;
    const input = {
      title: data.title,
      description: data.description,
      priority: values.priority,
      due_at: values.due_at,
    };
    try {
      if (task) {
        if (dueChanged) await reschedule.reschedule(task.id, values.due_at);
        await update.mutateAsync({
          id: task.id,
          patch: { title: input.title, description: input.description, priority: input.priority },
        });
      } else {
        await create.mutateAsync(input);
      }
      goBack();
    } catch {
      // aviso con failed
    }
  }

  async function handleDelete() {
    if (!task || !(await confirmDelete())) return;
    try {
      await remove.mutateAsync(task.id);
      goBack();
    } catch {
      // aviso con failed
    }
  }

  const selectedQuick = (key: QuickDue | 'none') => {
    if (key === 'none') return values.due_at === null;
    if (!values.due_at) return false;
    return localDayKey(new Date(values.due_at), tz) === localDayKey(new Date(quickDue(key, now, tz)), tz);
  };

  return (
    <Screen testID="task-form-screen" edges={[]}>
      <Stack.Screen options={{ title: task ? 'Editar tarea' : 'Nueva tarea' }} />

      {task && task.status === 'done' ? <Badge label="Completada" tone="success" /> : null}

      <TextField
        label="Tarea"
        value={values.title}
        onChangeText={(title) => setValues((v) => ({ ...v, title }))}
        error={errors.title}
        placeholder="Ej.: Entregar informe de prácticas"
        maxLength={200}
        autoFocus={!task}
        testID="task-title"
      />
      <TextField
        label="Descripción (opcional)"
        value={values.description}
        onChangeText={(description) => setValues((v) => ({ ...v, description }))}
        error={errors.description}
        multiline
        style={styles.multiline}
        textAlignVertical="top"
      />

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Prioridad
        </Text>
        <View style={styles.wrap}>
          {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
            <Chip
              key={p}
              label={priorityMeta[p].label}
              selected={values.priority === p}
              onPress={() => setValues((v) => ({ ...v, priority: p }))}
              testID={`priority-${p}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Fecha límite
        </Text>
        <View style={styles.wrap}>
          {quickOptions.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              selected={selectedQuick(o.key)}
              onPress={() => pickQuick(o.key)}
              testID={`due-${o.key}`}
            />
          ))}
        </View>
        <DateTimeField
          label="Fecha y hora exactas"
          value={values.due_at}
          display={display}
          onChange={(day, time) => setValues((v) => ({ ...v, due_at: zonedToUtcIso(day, time, tz) }))}
          testID="task-due"
        />
        {values.due_at ? (
          <Text variant="caption" color="textMuted">
            {dueLabel({ due_at: values.due_at, status: 'todo' }, now, tz)}
            {task && task.rescheduled_count > 0
              ? ` · reprogramada ${task.rescheduled_count} ${task.rescheduled_count === 1 ? 'vez' : 'veces'}`
              : ''}
          </Text>
        ) : null}
      </View>

      {offlineTried && !online ? <Notice tone="info" message={OFFLINE_SAVE_MESSAGE} testID="offline-save" /> : null}
      {failed ? <Notice tone="error" message="No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." /> : null}

      <Button
        label={task ? 'Guardar cambios' : 'Crear tarea'}
        icon="checkmark"
        onPress={save}
        loading={saving}
        fullWidth
        testID="save-task"
      />

      {task ? (
        <View style={styles.actions}>
          <Button
            label={task.status === 'done' ? 'Reabrir' : 'Completar'}
            icon={task.status === 'done' ? 'refresh' : 'checkmark-done'}
            variant="secondary"
            grow
            onPress={() => {
              setStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' });
              goBack();
            }}
            testID="toggle-task-done"
          />
          <Button
            label="Eliminar"
            icon="trash-outline"
            variant="danger"
            grow
            onPress={handleDelete}
            testID="delete-task"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, paddingTop: spacing.md },
  block: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
});
