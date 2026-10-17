import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  IconButton,
  ProgressRing,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useEvents } from '@/features/events/api';
import { nextEvent } from '@/features/events/logic';
import { useHabitData, useHabitStepper, useToday } from '@/features/habits/api';
import { HabitRow } from '@/features/habits/components/HabitRow';
import { buildContext, streaks, todayItems, todaySummary } from '@/features/habits/logic';
import { useProfile, useUserTimeZone } from '@/features/profile/api';
import { useSetTaskStatus, useTasks } from '@/features/tasks/api';
import { groupTasks, localTime } from '@/features/tasks/logic';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, greeting, timeUntil } from '@/lib/dates';
import { colors, spacing } from '@/theme';
import { NutritionSummary, ProgressSummary, TrainingSummary } from './summaries';

const MAX_PENDING = 4;

export function DashboardScreen() {
  const now = useNow();
  const timeZone = useUserTimeZone();
  const today = useToday(now);
  const profile = useProfile();
  const habits = useHabitData();
  const stepper = useHabitStepper();
  const events = useEvents();
  const tasks = useTasks();
  const setTaskStatus = useSetTaskStatus();

  const upcomingEvent = useMemo(() => nextEvent(events.data ?? [], now, timeZone), [events.data, now, timeZone]);
  const dueTasks = useMemo(() => {
    const groups = groupTasks(tasks.data ?? [], now, timeZone);
    return [...(groups.find((g) => g.key === 'overdue')?.tasks ?? []), ...(groups.find((g) => g.key === 'today')?.tasks ?? [])];
  }, [tasks.data, now, timeZone]);

  const firstName = profile.data?.display_name?.split(' ')[0];

  const { items, summary } = useMemo(() => {
    const list = todayItems(habits.habits, habits.logs, habits.restDays, today).map((i) => ({
      ...i,
      streak: streaks(i.habit, buildContext(i.habit, habits.logs, habits.restDays), today).current,
    }));
    return { items: list, summary: todaySummary(list) };
  }, [habits.habits, habits.logs, habits.restDays, today]);

  const pending = items.filter((i) => !i.done);
  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : null;
  const isRestDay = habits.restDays.includes(today);

  return (
    <Screen
      testID="dashboard-screen"
      refreshControl={<RefreshControl refreshing={habits.isRefetching} onRefresh={habits.refetch} tintColor={colors.accent} />}>
      <ScreenHeader
        subtitle={formatLongDate(now, timeZone)}
        title={firstName ? `${greeting(now, timeZone)}, ${firstName}` : greeting(now, timeZone)}
        right={<IconButton icon="settings-outline" accessibilityLabel="Abrir ajustes" onPress={() => router.push('/settings')} />}
      />

      <Card onPress={() => router.push('/habits')} accessibilityLabel="Ver hábitos de hoy" testID="today-progress">
        <View style={styles.progressRow}>
          <ProgressRing
            value={summary.done}
            total={summary.total}
            accessibilityLabel={
              percent === null ? 'Nada programado para hoy' : `${percent} por ciento de los hábitos de hoy completados`
            }>
            <Text variant="metric" color={percent === null ? 'textMuted' : 'text'}>
              {percent === null ? '—' : `${percent}%`}
            </Text>
          </ProgressRing>
          <View style={styles.progressText}>
            <Text variant="heading">Progreso de hoy</Text>
            <Text variant="caption" color="textSecondary">
              {habits.isLoading
                ? 'Cargando…'
                : habits.habits.length === 0
                  ? 'Crea tu primer hábito para empezar a medir tu día.'
                  : summary.total === 0
                    ? isRestDay
                      ? 'Hoy es tu día de descanso.'
                      : 'No tienes hábitos programados para hoy.'
                    : `${summary.done} de ${summary.total} hábitos completados.`}
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader
        title="Hábitos pendientes"
        actionLabel={habits.habits.length ? 'Ver todos' : undefined}
        onAction={() => router.push('/habits')}
      />
      <Card>
        {pending.length > 0 ? (
          pending.slice(0, MAX_PENDING).map((item, i) => (
            <HabitRow
              key={item.habit.id}
              first={i === 0}
              habit={item.habit}
              value={item.value}
              done={item.done}
              streak={item.streak}
              subtitle={
                item.week
                  ? `${item.week.count} de ${item.week.target} esta semana`
                  : item.habit.target_per_period > 1
                    ? `${item.value} de ${item.habit.target_per_period}${item.habit.unit ? ` ${item.habit.unit}` : ''}`
                    : 'Pendiente'
              }
              onToggle={() => stepper.step(item.habit, today)}
              onOpen={() => router.push({ pathname: '/habit/[id]', params: { id: item.habit.id } })}
            />
          ))
        ) : (
          <View style={styles.emptyRow}>
            <Ionicons
              name={summary.total ? 'checkmark-done-circle' : 'leaf-outline'}
              size={22}
              color={summary.total ? colors.success : colors.textMuted}
            />
            <Text variant="body" color="textSecondary" style={styles.flex}>
              {summary.total ? '¡Completaste todos los hábitos de hoy!' : 'Sin hábitos pendientes.'}
            </Text>
          </View>
        )}
        {pending.length > MAX_PENDING ? (
          <Text variant="caption" color="textMuted">
            y {pending.length - MAX_PENDING} más…
          </Text>
        ) : null}
      </Card>

      <ProgressSummary />

      <SectionHeader title="Crear rápido" />
      <View style={styles.quick}>
        <IconButton icon="flame-outline" accessibilityLabel="Nuevo hábito" onPress={() => router.push('/habit/new')} testID="quick-new-habit" />
        <IconButton icon="checkbox-outline" accessibilityLabel="Nueva tarea" onPress={() => router.push('/task/new')} testID="quick-new-task" />
        <IconButton icon="calendar-outline" accessibilityLabel="Nuevo evento" onPress={() => router.push('/event/new')} testID="quick-new-event" />
        <IconButton icon="document-text-outline" accessibilityLabel="Nueva nota" onPress={() => router.push('/note/new')} testID="quick-new-note" />
        <IconButton icon="camera-outline" accessibilityLabel="Foto de comida" onPress={() => router.push('/nutrition/photo')} testID="quick-photo" />
      </View>
      <Button label="Preguntar al asistente" icon="sparkles-outline" variant="secondary" fullWidth onPress={() => router.push('/assistant')} testID="open-assistant" />

      <SectionHeader title="Próximo evento" actionLabel="Calendario" onAction={() => router.push('/planner')} />
      {upcomingEvent ? (
        <Card
          onPress={() => router.push({ pathname: '/event/[id]', params: { id: upcomingEvent.event.id } })}
          accessibilityLabel={`Próximo evento: ${upcomingEvent.event.title}`}
          testID="next-event">
          <View style={styles.eventRow}>
            <View style={styles.eventBar} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {upcomingEvent.event.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {upcomingEvent.event.all_day
                  ? 'Todo el día'
                  : `${localTime(upcomingEvent.event.starts_at, timeZone)} – ${localTime(upcomingEvent.event.ends_at, timeZone)}`}
                {upcomingEvent.event.location ? ` · ${upcomingEvent.event.location}` : ''}
              </Text>
            </View>
            <Text variant="caption" color={upcomingEvent.ongoing ? 'success' : 'accent'} testID="next-event-when">
              {upcomingEvent.ongoing ? 'En curso' : timeUntil(new Date(upcomingEvent.event.starts_at), now)}
            </Text>
          </View>
        </Card>
      ) : (
        <Card>
          <Text variant="body" color="textSecondary">
            {events.isLoading ? 'Cargando…' : 'No tienes eventos próximos.'}
          </Text>
        </Card>
      )}

      <SectionHeader title="Tareas de hoy" actionLabel="Ver todas" onAction={() => router.push('/planner')} />
      <Card testID="today-tasks">
        {dueTasks.length ? (
          dueTasks.slice(0, 3).map((t, i) => (
            <TaskRow
              key={t.id}
              first={i === 0}
              task={t}
              now={now}
              timeZone={timeZone}
              onToggle={() => setTaskStatus.mutate({ id: t.id, status: 'done' })}
              onOpen={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })}
            />
          ))
        ) : (
          <Text variant="body" color="textSecondary">
            {tasks.isLoading ? 'Cargando…' : 'Nada pendiente para hoy.'}
          </Text>
        )}
        {dueTasks.length > 3 ? (
          <Text variant="caption" color="textMuted">
            y {dueTasks.length - 3} más…
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Entrenamiento de hoy" />
      <TrainingSummary />
      <SectionHeader title="Nutrición de hoy" />
      <NutritionSummary />

      <Button label="Estadísticas" icon="stats-chart-outline" variant="ghost" onPress={() => router.push('/stats')} testID="open-stats" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  progressText: { flex: 1, gap: spacing.xs },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  quick: { flexDirection: 'row', justifyContent: 'space-between' },
  flex: { flex: 1, gap: spacing.xxs },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  eventBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.events },
});
