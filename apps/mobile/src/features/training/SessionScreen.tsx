import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Badge, Button, Card, Chip, ErrorState, LoadingState, Notice, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import { useActivePlan, useDeleteSession, useDeleteSet, useExercises, useFinishSession, useLogSet, useSessions, useSetLogs } from './api';
import { COOLDOWN, isTimed, repsUnit, WARMUP } from './constants';
import { sessionVolume, suggestNext } from './logic';
import type { Exercise, PlanExercise, SetLog } from './types';

export function SessionScreen({ id }: { id: string }) {
  const sessions = useSessions();
  const sets = useSetLogs();
  const plan = useActivePlan();
  const exercises = useExercises();
  if (sessions.isLoading || sets.isLoading || plan.isLoading || exercises.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  const session = sessions.data?.find((s) => s.id === id);
  if (!session) {
    return (
      <Screen edges={[]}>
        <ErrorState message="No se encontró este entrenamiento." onRetry={() => sessions.refetch()} />
      </Screen>
    );
  }
  const planItems =
    plan.data && plan.data.plan.id === session.plan_id && session.day_index != null ? plan.data.items.filter((i) => i.day_index === session.day_index) : [];
  return <Session session={session} allSessions={sessions.data ?? []} allSets={sets.data ?? []} planItems={planItems} catalog={exercises.data ?? []} />;
}

type Props = {
  session: NonNullable<ReturnType<typeof useSessions>['data']>[number];
  allSessions: NonNullable<ReturnType<typeof useSessions>['data']>;
  allSets: SetLog[];
  planItems: PlanExercise[];
  catalog: Exercise[];
};

function Session({ session, allSessions, allSets, planItems, catalog }: Props) {
  const tz = useUserTimeZone();
  const finish = useFinishSession();
  const remove = useDeleteSession();
  const [effort, setEffort] = useState<number | null>(session.perceived_effort);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [warm, setWarm] = useState<boolean[]>(WARMUP.map(() => false));
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const done = !!session.finished_at;
  const mine = allSets.filter((s) => s.session_id === session.id);

  // Ejercicios a mostrar: los del día de la rutina + cualquiera ya registrado (sesiones viejas).
  const rows = useMemo(() => {
    const out: { exercise: Exercise; pe: Pick<PlanExercise, 'sets' | 'reps_min' | 'reps_max' | 'rest_seconds' | 'suggested_kg'> | null }[] = [];
    for (const pe of planItems) {
      const ex = byId.get(pe.exercise_id);
      if (ex) out.push({ exercise: ex, pe });
    }
    for (const exId of new Set(mine.map((s) => s.exercise_id))) {
      if (!out.some((r) => r.exercise.id === exId) && byId.get(exId)) out.push({ exercise: byId.get(exId)!, pe: null });
    }
    return out;
  }, [planItems, mine, byId]);

  /** Series de la última sesión terminada (anterior a esta) para un ejercicio. */
  function lastSetsOf(exId: string) {
    const prev = allSessions
      .filter((s) => s.id !== session.id && s.finished_at && s.started_at < session.started_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .find((s) => allSets.some((x) => x.session_id === s.id && x.exercise_id === exId));
    return prev ? allSets.filter((x) => x.session_id === prev.id && x.exercise_id === exId) : [];
  }

  async function onFinish() {
    if (mine.length === 0) {
      Alert.alert('Sin series registradas', 'Registra al menos una serie o descarta el entrenamiento.');
      return;
    }
    try {
      await finish.mutateAsync({ id: session.id, perceived_effort: effort, notes });
      router.replace('/training');
    } catch {
      Alert.alert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  function onDiscard() {
    Alert.alert(done ? 'Eliminar entrenamiento' : 'Descartar entrenamiento', 'Se borrarán las series registradas de esta sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: done ? 'Eliminar' : 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await remove.mutateAsync(session.id).catch(() => null);
          router.replace('/training');
        },
      },
    ]);
  }

  return (
    <Screen testID="session-screen" edges={[]}>
      <Stack.Screen options={{ title: session.title }} />
      <View style={styles.between}>
        <Text variant="caption" color="textSecondary">
          {new Intl.DateTimeFormat('es-PE', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(session.started_at))}
        </Text>
        {done ? <Badge label="Terminado" tone="success" /> : <Badge label="En curso" tone="accent" />}
      </View>

      {!done ? (
        <Card>
          <Text variant="label" color="textSecondary">
            CALENTAMIENTO (5–8 MIN)
          </Text>
          {WARMUP.map((w, i) => (
            <Pressable key={i} onPress={() => setWarm((o) => o.map((x, j) => (j === i ? !x : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: warm[i] }} style={styles.check}>
              <Ionicons name={warm[i] ? 'checkbox' : 'square-outline'} size={20} color={warm[i] ? colors.success : colors.textMuted} />
              <Text variant="caption" color="textSecondary" style={styles.flex}>
                {w}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {rows.length === 0 ? <Notice tone="info" message="Esta sesión no tiene ejercicios de la rutina activa." /> : null}

      {rows.map(({ exercise, pe }) => (
        <ExerciseBlock key={exercise.id} sessionId={session.id} exercise={exercise} pe={pe} logged={mine.filter((s) => s.exercise_id === exercise.id)} last={lastSetsOf(exercise.id)} readOnly={done} />
      ))}

      {done ? (
        <Card>
          <Text variant="bodyStrong">Resumen</Text>
          <Text variant="caption" color="textSecondary">
            {mine.length} series · volumen {sessionVolume(mine)} kg·reps{session.perceived_effort ? ` · esfuerzo ${session.perceived_effort}/10` : ''}
          </Text>
          {session.notes ? <Text variant="caption">{session.notes}</Text> : null}
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="label" color="textSecondary">
              VUELTA A LA CALMA
            </Text>
            {COOLDOWN.map((c, i) => (
              <Text key={i} variant="caption" color="textSecondary">
                • {c}
              </Text>
            ))}
          </Card>
          <SectionHeader title="¿Qué tan duro fue? (1–10)" />
          <View style={styles.wrap}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Chip key={n} compact label={String(n)} accessibilityLabel={`Esfuerzo ${n}`} selected={effort === n} onPress={() => setEffort(effort === n ? null : n)} testID={`effort-${n}`} />
            ))}
          </View>
          <Text variant="caption" color="textMuted">
            Te ayuda a ajustar la carga: si siempre es 9–10, conviene bajar un poco o descansar más.
          </Text>
          <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={1000} multiline placeholder="Cómo te sentiste, molestias…" />
          <Button label="Terminar entrenamiento" icon="flag" onPress={onFinish} loading={finish.isPending} fullWidth testID="finish-session" />
        </>
      )}
      <Button label={done ? 'Eliminar del historial' : 'Descartar'} variant="danger" onPress={onDiscard} fullWidth testID="discard-session" />
    </Screen>
  );
}

function ExerciseBlock({
  sessionId,
  exercise,
  pe,
  logged,
  last,
  readOnly,
}: {
  sessionId: string;
  exercise: Exercise;
  pe: Pick<PlanExercise, 'sets' | 'reps_min' | 'reps_max' | 'rest_seconds' | 'suggested_kg'> | null;
  logged: SetLog[];
  last: SetLog[];
  readOnly: boolean;
}) {
  const logSet = useLogSet();
  const delSet = useDeleteSet();
  const target = pe ?? { sets: Math.max(logged.length, 1), reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null };
  const sug = suggestNext(target, exercise, last);
  const timed = isTimed(exercise);
  const weighted = !['bodyweight', 'pullup_bar', 'dip_bars'].includes(exercise.equipment) || logged.some((s) => s.weight_kg > 0);
  const maxLogged = Math.max(0, ...logged.map((s) => s.set_number));
  const nextNumber = maxLogged + 1;
  const [reps, setReps] = useState(String(sug.reps));
  const [kg, setKg] = useState(sug.weight_kg != null ? String(sug.weight_kg) : '');
  const [extra, setExtra] = useState(0);
  const rowCount = readOnly ? maxLogged : Math.max(target.sets + extra, maxLogged);

  function save(setNumber: number) {
    const r = Math.round(Number(reps.replace(',', '.')));
    const w = kg.trim() === '' ? 0 : Number(kg.replace(',', '.'));
    if (!Number.isFinite(r) || r < 0 || r > 300 || !Number.isFinite(w) || w < 0 || w > 500) {
      Alert.alert('Revisa los valores', `${timed ? 'Segundos' : 'Repeticiones'} entre 0 y 300 y peso entre 0 y 500 kg.`);
      return;
    }
    logSet.mutate({ session_id: sessionId, exercise_id: exercise.id, set_number: setNumber, reps: r, weight_kg: Math.round(w * 10) / 10 });
  }

  return (
    <Card testID={`block-${exercise.code ?? exercise.id}`}>
      <Pressable onPress={() => router.push(`/training/exercise/${exercise.id}`)} accessibilityRole="link" accessibilityLabel={`Técnica de ${exercise.name_es}`}>
        <View style={styles.between}>
          <Text variant="heading" style={styles.flex}>
            {exercise.name_es}
          </Text>
          <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
        </View>
      </Pressable>
      {pe ? (
        <Text variant="caption" color="textSecondary">
          Meta: {pe.sets}×{pe.reps_min}–{pe.reps_max} {repsUnit(exercise)} · descanso {pe.rest_seconds}s
        </Text>
      ) : null}
      {!readOnly ? (
        <Text variant="caption" color="accent" testID={`suggestion-${exercise.code ?? exercise.id}`}>
          {sug.reason}
        </Text>
      ) : null}

      {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
        const s = logged.find((x) => x.set_number === n);
        if (s) {
          return (
            <View key={n} style={styles.setRow} testID={`set-${exercise.code ?? exercise.id}-${n}`}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text variant="body" style={styles.flex}>
                Serie {n}: {s.reps} {timed ? 's' : 'reps'}
                {s.weight_kg > 0 ? ` × ${s.weight_kg} kg` : ''}
              </Text>
              {!readOnly ? (
                <Pressable onPress={() => delSet.mutate({ session_id: sessionId, exercise_id: exercise.id, set_number: n })} accessibilityRole="button" accessibilityLabel={`Borrar serie ${n}`} style={styles.iconHit}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          );
        }
        if (readOnly || n !== nextNumber) {
          return readOnly ? null : (
            <Text key={n} variant="caption" color="textMuted" style={styles.pending}>
              Serie {n}
            </Text>
          );
        }
        return (
          <View key={n} style={styles.setRow}>
            <Text variant="bodyStrong">S{n}</Text>
            <TextInput
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel={`${timed ? 'Segundos' : 'Repeticiones'} de la serie ${n}`}
              placeholderTextColor={colors.textMuted}
              testID={`reps-${exercise.code ?? exercise.id}`}
            />
            <Text variant="caption" color="textSecondary">
              {timed ? 's' : 'reps'}
            </Text>
            {weighted ? (
              <>
                <TextInput value={kg} onChangeText={setKg} keyboardType="decimal-pad" placeholder="0" style={styles.input} accessibilityLabel={`Kilos de la serie ${n}`} placeholderTextColor={colors.textMuted} testID={`kg-${exercise.code ?? exercise.id}`} />
                <Text variant="caption" color="textSecondary">
                  kg
                </Text>
              </>
            ) : null}
            <View style={styles.flex} />
            <Pressable onPress={() => save(n)} accessibilityRole="button" accessibilityLabel={`Registrar serie ${n}`} style={styles.saveBtn} testID={`log-${exercise.code ?? exercise.id}`}>
              <Ionicons name="checkmark" size={22} color={colors.textOnAccent} />
            </Pressable>
          </View>
        );
      })}
      {!readOnly && nextNumber > target.sets + extra ? <Button label="Serie extra" variant="ghost" icon="add" onPress={() => setExtra((e) => e + 1)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTouchSize },
  pending: { paddingVertical: spacing.xs },
  input: {
    minWidth: 56,
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    fontSize: 16,
  },
  saveBtn: { width: minTouchSize, height: minTouchSize, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  iconHit: { width: minTouchSize, height: minTouchSize, alignItems: 'center', justifyContent: 'center' },
});
