import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Notice,
  ProgressRing,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useHabitData, useHabitStepper, useToday, useToggleRestDay } from './api';
import { HabitRow } from './components/HabitRow';
import { buildContext, isScheduled, streaks, todayItems, todaySummary } from './logic';
import { scheduleLabel } from './presets';
import type { Habit } from './types';

export function HabitsScreen() {
  const today = useToday();
  const data = useHabitData();
  const stepper = useHabitStepper();
  const toggleRest = useToggleRestDay();

  const isRestDay = data.restDays.includes(today);

  const view = useMemo(() => {
    const items = todayItems(data.habits, data.logs, data.restDays, today);
    const todayIds = new Set(items.map((i) => i.habit.id));
    const streakOf = (h: Habit) => streaks(h, buildContext(h, data.logs, data.restDays), today).current;
    return {
      items: items.map((i) => ({ ...i, streak: streakOf(i.habit) })),
      summary: todaySummary(items),
      others: data.habits
        .filter((h) => h.status === 'active' && !todayIds.has(h.id))
        .map((h) => ({ habit: h, streak: streakOf(h) })),
      paused: data.habits.filter((h) => h.status === 'paused'),
    };
  }, [data.habits, data.logs, data.restDays, today]);

  const header = (
    <ScreenHeader
      title="Hábitos"
      right={
        <IconButton icon="add" tone="accent" accessibilityLabel="Nuevo hábito" onPress={() => router.push('/habit/new')} testID="new-habit" />
      }
    />
  );

  if (data.isLoading) {
    return (
      <Screen testID="habits-screen">
        {header}
        <LoadingState label="Cargando hábitos…" />
      </Screen>
    );
  }

  if (data.error && data.habits.length === 0) {
    return (
      <Screen testID="habits-screen">
        {header}
        <ErrorState message="No se pudieron cargar tus hábitos. Revisa tu conexión." onRetry={data.refetch} />
      </Screen>
    );
  }

  if (data.habits.length === 0) {
    return (
      <Screen testID="habits-screen">
        {header}
        <Card>
          <EmptyState
            icon="flame-outline"
            title="Aún no tienes hábitos"
            description="Empieza con uno pequeño. Puedes usar una plantilla: estudiar, leer, entrenar, dormir, agua o rutina."
            actionLabel="Crear mi primer hábito"
            onAction={() => router.push('/habit/new')}
            testID="habits-empty"
          />
        </Card>
      </Screen>
    );
  }

  const { done, total } = view.summary;

  return (
    <Screen
      testID="habits-screen"
      refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} tintColor={colors.accent} />}>
      {header}

      <Card>
        <View style={styles.summary}>
          <ProgressRing
            value={done}
            total={total}
            size={72}
            accessibilityLabel={total ? `${done} de ${total} hábitos de hoy completados` : 'Nada programado para hoy'}>
            <Text variant="heading">{total ? `${done}/${total}` : '—'}</Text>
          </ProgressRing>
          <View style={styles.summaryText}>
            <Text variant="heading">
              {isRestDay
                ? 'Día de descanso'
                : total === 0
                  ? 'Nada programado hoy'
                  : done === total
                    ? '¡Todo listo por hoy!'
                    : `Te faltan ${total - done}`}
            </Text>
            <Text variant="caption" color="textSecondary">
              {isRestDay
                ? 'Hoy no se cuenta en tus rachas. Puedes marcar hábitos igual.'
                : 'Los días de descanso no rompen tus rachas.'}
            </Text>
          </View>
        </View>
        <Button
          label={isRestDay ? 'Quitar día de descanso' : 'Marcar hoy como descanso'}
          icon={isRestDay ? 'close-circle-outline' : 'bed-outline'}
          variant="ghost"
          loading={toggleRest.isPending}
          onPress={() => toggleRest.mutate({ date: today, rest: !isRestDay })}
          testID="toggle-rest-day"
        />
      </Card>

      {stepper.isError ? <Notice tone="error" message="No se pudo guardar el último cambio. Inténtalo de nuevo." /> : null}

      {view.items.length > 0 ? (
        <>
          <SectionHeader title="Hoy" />
          <Card>
            {view.items.map((item, i) => (
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
                      : scheduleLabel(item.habit)
                }
                onToggle={() => stepper.step(item.habit, today)}
                onOpen={() => router.push({ pathname: '/habit/[id]', params: { id: item.habit.id } })}
              />
            ))}
          </Card>
        </>
      ) : null}

      {view.others.length > 0 ? (
        <>
          <SectionHeader title="Otros días" />
          <Card>
            {view.others.map(({ habit, streak }, i) => (
              <HabitRow
                key={habit.id}
                first={i === 0}
                habit={habit}
                streak={streak}
                subtitle={
                  habit.frequency === 'weekly'
                    ? 'Meta semanal cumplida'
                    : isScheduled(habit, today)
                      ? scheduleLabel(habit)
                      : `${scheduleLabel(habit)} · hoy no toca`
                }
                onOpen={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
              />
            ))}
          </Card>
        </>
      ) : null}

      {view.paused.length > 0 ? (
        <>
          <SectionHeader title="En pausa" />
          <Card>
            {view.paused.map((habit, i) => (
              <HabitRow
                key={habit.id}
                first={i === 0}
                habit={habit}
                subtitle="En pausa · no cuenta en tus estadísticas"
                onOpen={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryText: { flex: 1, gap: spacing.xs },
});
