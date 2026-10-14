import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Notice, Screen, SectionHeader, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { useDeleteHabit, useHabitData, useHabitStepper, useToday, useUpdateHabit } from './api';
import { addDays, buildContext, completionRate, isDayDone, isScheduled, streaks, weekStart } from './logic';
import { categoryMeta, scheduleLabel, weekDays } from './presets';

const WEEKS = 5;

function confirmDelete(name: string): Promise<boolean> {
  const msg = `"${name}" desaparecerá de tu lista. Esta acción no se puede deshacer desde la app.`;
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Eliminar hábito', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Vuelve atrás, o a la lista si se llegó por enlace directo. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/habits');
}

export function HabitDetailScreen({ id }: { id: string }) {
  const today = useToday();
  const data = useHabitData();
  const stepper = useHabitStepper();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const habit = data.habits.find((h) => h.id === id);

  const stats = useMemo(() => {
    if (!habit) return null;
    const ctx = buildContext(habit, data.logs, data.restDays);
    const s = streaks(habit, ctx, today);
    const rate = completionRate(habit, ctx, today, 30);
    const firstMonday = addDays(weekStart(today), -7 * (WEEKS - 1));
    const grid = Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const day = addDays(firstMonday, w * 7 + d);
        const value = ctx.values.get(day) ?? 0;
        return {
          day,
          value,
          done: isDayDone(habit, value),
          scheduled: isScheduled(habit, day),
          rest: ctx.restDays.has(day),
          future: day > today,
        };
      }),
    );
    return { s, rate, grid };
  }, [habit, data.logs, data.restDays, today]);

  if (!habit || !stats) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Hábito' }} />
        {data.isLoading ? null : (
          <EmptyState icon="help-circle-outline" title="Este hábito ya no existe" actionLabel="Volver" onAction={goBack} />
        )}
      </Screen>
    );
  }

  const meta = categoryMeta[habit.category ?? 'other'];
  const color = habit.color ?? meta.color;
  const paused = habit.status === 'paused';

  async function handleDelete() {
    if (!habit || !(await confirmDelete(habit.name))) return;
    try {
      await remove.mutateAsync(habit.id);
      goBack();
    } catch {
      // aviso abajo
    }
  }

  return (
    <Screen testID="habit-detail-screen" edges={[]}>
      <Stack.Screen options={{ title: habit.name }} />

      <View style={styles.head}>
        <View style={[styles.icon, { borderColor: color }]}>
          <Ionicons name={meta.icon} size={22} color={color} />
        </View>
        <View style={styles.headText}>
          <Text variant="title">{habit.name}</Text>
          <Text variant="caption" color="textSecondary">
            {meta.label} · {scheduleLabel(habit)}
            {habit.frequency === 'daily' && habit.target_per_period > 1
              ? ` · ${habit.target_per_period} ${habit.unit ?? 'veces'} al día`
              : ''}
          </Text>
        </View>
        {paused ? <Badge label="En pausa" tone="warning" /> : null}
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.stat}>
          <Text variant="metric" color="warning">
            {stats.s.current}
          </Text>
          <Text variant="caption" color="textSecondary">
            Racha actual ({stats.s.unit})
          </Text>
        </Card>
        <Card style={styles.stat}>
          <Text variant="metric">{stats.s.best}</Text>
          <Text variant="caption" color="textSecondary">
            Mejor racha
          </Text>
        </Card>
        <Card style={styles.stat}>
          <Text variant="metric">{stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`}</Text>
          <Text variant="caption" color="textSecondary">
            Últimos 30 días
          </Text>
        </Card>
      </View>
      <Text variant="caption" color="textMuted">
        Calculado con tus registros: días cumplidos entre días programados. Los días de descanso no cuentan.
      </Text>

      <SectionHeader title={`Últimas ${WEEKS} semanas`} />
      <Card>
        <View style={styles.gridRow}>
          {weekDays.map((d) => (
            <Text key={d.value} variant="caption" color="textMuted" style={styles.gridHead}>
              {d.short}
            </Text>
          ))}
        </View>
        {stats.grid.map((week) => (
          <View key={week[0].day} style={styles.gridRow}>
            {week.map((cell) => {
              const label = `${cell.day}: ${cell.future ? 'futuro' : cell.done ? 'cumplido' : cell.rest ? 'descanso' : cell.scheduled ? 'no cumplido' : 'no programado'}`;
              return (
                <Pressable
                  key={cell.day}
                  disabled={cell.future || paused}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}. Tocar para cambiar.`}
                  accessibilityState={{ disabled: cell.future || paused, checked: cell.done }}
                  onPress={() => stepper.step(habit, cell.day)}
                  style={[
                    styles.cell,
                    cell.done && { backgroundColor: color, borderColor: color },
                    !cell.done && cell.scheduled && !cell.future && !cell.rest && styles.missed,
                    cell.rest && styles.rest,
                    cell.day === today && styles.today,
                    cell.future && styles.future,
                  ]}>
                  {cell.rest && !cell.done ? <Ionicons name="bed-outline" size={12} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text variant="caption" color="textMuted">
          Toca un día pasado para corregirlo.
        </Text>
      </Card>

      {update.isError || remove.isError || stepper.isError ? (
        <Notice tone="error" message="No se pudo guardar el cambio. Revisa tu conexión." />
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Editar"
          icon="create-outline"
          variant="secondary"
          grow
          onPress={() => router.push({ pathname: '/habit/edit/[id]', params: { id: habit.id } })}
          testID="edit-habit"
        />
        <Button
          label={paused ? 'Reanudar' : 'Pausar'}
          icon={paused ? 'play-outline' : 'pause-outline'}
          variant="secondary"
          grow
          loading={update.isPending}
          onPress={() => update.mutate({ id: habit.id, patch: { status: paused ? 'active' : 'paused' } })}
          testID="pause-habit"
        />
      </View>
      <Button label="Eliminar hábito" icon="trash-outline" variant="danger" onPress={handleDelete} loading={remove.isPending} testID="delete-habit" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: spacing.xxs },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs, padding: spacing.md },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  gridHead: { flex: 1, textAlign: 'center' },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missed: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  rest: { backgroundColor: colors.surface, borderStyle: 'dashed' },
  today: { borderColor: colors.text, borderWidth: 2 },
  future: { opacity: 0.3 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
