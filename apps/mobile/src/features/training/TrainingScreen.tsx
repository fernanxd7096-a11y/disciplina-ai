import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorState, IconButton, LoadingState, Notice, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { useToday } from '@/features/habits/api';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { colors, spacing } from '@/theme';
import { useActivePlan, useExercises, useFitnessProfile, useSessions, useStartSession } from './api';
import { equipmentLabels, experienceLabels, goalLabels, muscleLabels, repsUnit } from './constants';
import { nextDayIndex, sessionsThisWeek } from './logic';

export function TrainingScreen() {
  const online = useIsOnline();
  const tz = useUserTimeZone();
  const today = useToday();
  const profile = useFitnessProfile();
  const plan = useActivePlan();
  const exercises = useExercises();
  const sessions = useSessions();
  const start = useStartSession();

  const byId = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const all = useMemo(() => sessions.data ?? [], [sessions.data]);
  const inProgress = all.find((s) => !s.finished_at);
  const finished = all.filter((s) => s.finished_at);
  const toDay = (iso: string) => localDayKey(new Date(iso), tz);

  const header = <ScreenHeader title="Entrenamiento" right={profile.data ? <IconButton icon="options-outline" accessibilityLabel="Editar perfil de entrenamiento" onPress={() => router.push('/training/profile')} testID="edit-fitness-profile" /> : null} />;

  const loading = profile.isLoading || plan.isLoading || sessions.isLoading;
  if (loading) {
    return (
      <Screen testID="training-screen">
        {header}
        <LoadingState label="Cargando entrenamiento…" />
      </Screen>
    );
  }
  if ((profile.error && !profile.data) || (plan.error && plan.data === undefined)) {
    return (
      <Screen testID="training-screen">
        {header}
        <ErrorState message="No se pudo cargar tu entrenamiento. Revisa tu conexión." onRetry={() => Promise.all([profile.refetch(), plan.refetch(), sessions.refetch()])} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen testID="training-screen">
        {header}
        <Card>
          <EmptyState
            icon="barbell-outline"
            title="Cuéntame cómo entrenas"
            description="Con tu objetivo, experiencia, días, tiempo y equipo armo una rutina con descansos incluidos."
            actionLabel="Completar perfil"
            onAction={() => router.push('/training/profile')}
            testID="training-no-profile"
          />
        </Card>
      </Screen>
    );
  }

  const p = profile.data;
  const active = plan.data;
  const weekCount = sessionsThisWeek(finished, today, toDay);
  const nextDay = active ? nextDayIndex(active.plan.day_labels.length, active.plan.id, all) : 0;
  const nextItems = active ? active.items.filter((i) => i.day_index === nextDay) : [];
  const weekDone = weekCount >= p.days_per_week;

  async function startDay(dayIndex: number) {
    if (!active) return;
    if (!online) {
      Alert.alert('Sin conexión', OFFLINE_SAVE_MESSAGE);
      return;
    }
    try {
      const s = await start.mutateAsync({ plan_id: active.plan.id, day_index: dayIndex, title: active.plan.day_labels[dayIndex] });
      router.push(`/training/session/${s.id}`);
    } catch {
      Alert.alert('No se pudo empezar', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  return (
    <Screen
      testID="training-screen"
      refreshControl={<RefreshControl refreshing={plan.isRefetching || sessions.isRefetching} onRefresh={() => Promise.all([plan.refetch(), sessions.refetch()])} tintColor={colors.accent} />}>
      {header}

      <Card>
        <View style={styles.row}>
          <Badge label={goalLabels[p.goal]} tone="accent" />
          <Badge label={experienceLabels[p.experience]} />
          <Badge label={`${p.days_per_week} días · ${p.minutes_per_session} min`} />
        </View>
        <Text variant="caption" color="textSecondary">
          Equipo: {['bodyweight', ...p.equipment].map((e) => equipmentLabels[e as keyof typeof equipmentLabels]).join(', ')}
        </Text>
        <Text variant="bodyStrong" testID="week-progress">
          Esta semana: {weekCount} de {p.days_per_week} entrenamientos
        </Text>
      </Card>

      {inProgress ? (
        <Card onPress={() => router.push(`/training/session/${inProgress.id}`)} accessibilityLabel={`Continuar ${inProgress.title}`} testID="resume-session">
          <Text variant="label" color="accent">
            EN CURSO
          </Text>
          <Text variant="heading">{inProgress.title}</Text>
          <Text variant="caption" color="textSecondary">
            Toca para continuar registrando tus series.
          </Text>
        </Card>
      ) : null}

      {!active ? (
        <Card>
          <EmptyState icon="list-outline" title="Sin rutina activa" description="Genera una rutina base con reglas fijas, o pide a la IA una más personalizada. Podrás revisarla antes de guardarla." testID="training-no-plan" />
          <Button label="Generar rutina base" icon="construct-outline" onPress={() => router.push('/training/plan-new?mode=basic')} fullWidth testID="plan-basic" />
          <Button label="Personalizar con IA" icon="sparkles-outline" variant="secondary" onPress={() => router.push('/training/plan-new?mode=ai')} fullWidth testID="plan-ai" />
        </Card>
      ) : (
        <>
          {!inProgress ? (
            <Card testID="next-workout">
              <Text variant="label" color="textSecondary">
                {weekDone ? 'YA CUMPLISTE TU SEMANA' : 'TE TOCA'}
              </Text>
              <Text variant="heading">{active.plan.day_labels[nextDay]}</Text>
              {weekDone ? (
                <Text variant="caption" color="textSecondary">
                  Descansar también es parte del plan. Si entrenas extra, que sea suave.
                </Text>
              ) : null}
              {nextItems.map((i) => {
                const ex = byId.get(i.exercise_id);
                return (
                  <Text key={i.id} variant="caption" color="textSecondary">
                    • {ex?.name_es ?? 'Ejercicio'} — {i.sets}×{i.reps_min}–{i.reps_max} {ex ? repsUnit(ex) : ''}
                  </Text>
                );
              })}
              <Button label="Empezar entrenamiento" icon="play" onPress={() => startDay(nextDay)} loading={start.isPending} fullWidth testID="start-workout" />
            </Card>
          ) : null}

          <SectionHeader title={active.plan.name} actionLabel="Cambiar rutina" onAction={() => router.push('/training/plan-new?mode=basic')} />
          {active.plan.day_labels.map((label, d) => {
            const items = active.items.filter((i) => i.day_index === d);
            return (
              <Card key={d} testID={`plan-day-${d}`}>
                <View style={styles.between}>
                  <Text variant="bodyStrong">
                    Día {d + 1} · {label}
                  </Text>
                  {active.plan.source === 'ai' && d === 0 ? <Badge label="Propuesta IA" tone="accent" /> : null}
                </View>
                {items.map((i) => {
                  const ex = byId.get(i.exercise_id);
                  return (
                    <Card key={i.id} onPress={() => router.push(`/training/exercise/${i.exercise_id}`)} accessibilityLabel={`Ver ${ex?.name_es}`} style={styles.exercise}>
                      <View style={styles.between}>
                        <Text variant="body">{ex?.name_es ?? '…'}</Text>
                        <Text variant="caption" color="textSecondary">
                          {i.sets}×{i.reps_min}–{i.reps_max} {ex ? repsUnit(ex) : ''} · {i.rest_seconds}s
                        </Text>
                      </View>
                      {ex ? (
                        <Text variant="caption" color="textMuted">
                          {muscleLabels[ex.muscle_group]}
                        </Text>
                      ) : null}
                    </Card>
                  );
                })}
                {!inProgress && d !== nextDay ? <Button label="Hacer este día" variant="ghost" onPress={() => startDay(d)} testID={`start-day-${d}`} /> : null}
              </Card>
            );
          })}
          {active.plan.notes ? <Notice tone="info" message={active.plan.notes} /> : null}
        </>
      )}

      <SectionHeader title="Historial" />
      {finished.length === 0 ? (
        <Text variant="caption" color="textMuted">
          Aún no terminaste ningún entrenamiento.
        </Text>
      ) : (
        finished.slice(0, 10).map((s) => (
          <Card key={s.id} onPress={() => router.push(`/training/session/${s.id}`)} accessibilityLabel={`Ver ${s.title}`} testID={`history-${s.id}`}>
            <View style={styles.between}>
              <Text variant="bodyStrong">{s.title}</Text>
              <Text variant="caption" color="textSecondary">
                {new Intl.DateTimeFormat('es-PE', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(s.started_at))}
              </Text>
            </View>
            {s.perceived_effort ? (
              <Text variant="caption" color="textMuted">
                Esfuerzo percibido: {s.perceived_effort}/10
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  exercise: { padding: spacing.md, gap: spacing.xxs },
});
