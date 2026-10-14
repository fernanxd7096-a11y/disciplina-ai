import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
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
import { useHabitData, useHabitStepper, useToday } from '@/features/habits/api';
import { HabitRow } from '@/features/habits/components/HabitRow';
import { buildContext, streaks, todayItems, todaySummary } from '@/features/habits/logic';
import { useProfile, useUserTimeZone } from '@/features/profile/api';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, greeting } from '@/lib/dates';
import { phaseNotice, type Feature } from '@/lib/roadmap';
import { colors, spacing } from '@/theme';

type DomainRow = { key: Feature; label: string; icon: ComponentProps<typeof Ionicons>['name']; color: string };

/** Módulos que aún no tienen datos reales (se van reemplazando por resúmenes reales). */
const upcoming: DomainRow[] = [
  { key: 'tasks', label: 'Tareas', icon: 'checkbox-outline', color: colors.tasks },
  { key: 'training', label: 'Entrenamiento', icon: 'barbell-outline', color: colors.training },
  { key: 'nutrition', label: 'Nutrición', icon: 'nutrition-outline', color: colors.nutrition },
];

const MAX_PENDING = 4;

export function DashboardScreen() {
  const now = useNow();
  const timeZone = useUserTimeZone();
  const today = useToday(now);
  const profile = useProfile();
  const habits = useHabitData();
  const stepper = useHabitStepper();

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

      <View style={styles.actions}>
        <Button label="Nuevo hábito" icon="add" variant="secondary" grow onPress={() => router.push('/habit/new')} testID="quick-new-habit" />
        <Button label="Asistente" icon="sparkles-outline" variant="secondary" grow onPress={() => router.push('/assistant')} testID="open-assistant" />
      </View>

      <SectionHeader title="Próximamente" />
      <Card>
        {upcoming.map((d, i) => (
          <View key={d.key} style={[styles.domainRow, i > 0 && styles.divider]}>
            <View style={[styles.domainIcon, { borderColor: d.color }]}>
              <Ionicons name={d.icon} size={18} color={d.color} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{d.label}</Text>
              <Text variant="caption" color="textMuted">
                {phaseNotice(d.key)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Button label="Estadísticas" icon="stats-chart-outline" variant="ghost" onPress={() => router.push('/stats')} testID="open-stats" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  progressText: { flex: 1, gap: spacing.xs },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  domainIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: spacing.xxs },
  actions: { flexDirection: 'row', gap: spacing.md },
});
