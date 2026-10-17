import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Badge, Card, Chip, ErrorState, LoadingState, Screen, SectionHeader, Text } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { colors, spacing } from '@/theme';
import { useExercises, useFitnessProfile, useSessions, useSetLogs } from './api';
import { equipmentLabels, experienceLabels, muscleLabels, repsUnit } from './constants';
import { allowedEquipment, alternativesFor, exerciseProgress } from './logic';

/** "Paso uno. Paso dos." → ["Paso uno.", "Paso dos."] */
export function steps(text: string): string[] {
  return text
    .split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ExerciseScreen({ id }: { id: string }) {
  const tz = useUserTimeZone();
  const exercises = useExercises();
  const profile = useFitnessProfile();
  const sessions = useSessions();
  const sets = useSetLogs();
  if (exercises.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  const catalog = exercises.data ?? [];
  const ex = catalog.find((e) => e.id === id);
  if (!ex) {
    return (
      <Screen edges={[]}>
        <ErrorState message="No se encontró el ejercicio." onRetry={() => exercises.refetch()} />
      </Screen>
    );
  }
  const equip = allowedEquipment({ equipment: profile.data?.equipment ?? [] });
  const alt = alternativesFor(ex, catalog, equip);
  const toDay = (iso: string) => localDayKey(new Date(iso), tz);
  const progress = exerciseProgress(sessions.data ?? [], sets.data ?? [], ex.id, toDay);
  const mistakes = ex.common_mistakes.split(';').map((m) => m.trim().replace(/\.$/, '')).filter(Boolean);

  return (
    <Screen testID="exercise-screen" edges={[]}>
      <Stack.Screen options={{ title: ex.name_es }} />
      <View style={styles.wrap}>
        <Badge label={muscleLabels[ex.muscle_group]} tone="accent" />
        <Badge label={equipmentLabels[ex.equipment]} />
        <Badge label={experienceLabels[ex.level]} />
      </View>

      <SectionHeader title="Técnica paso a paso" />
      <Card>
        {steps(ex.instructions).map((s, i) => (
          <View key={i} style={styles.step}>
            <Text variant="bodyStrong" color="accent">
              {i + 1}
            </Text>
            <Text variant="body" style={styles.flex}>
              {s}
            </Text>
          </View>
        ))}
      </Card>

      {mistakes.length ? (
        <>
          <SectionHeader title="Errores frecuentes" />
          <Card>
            {mistakes.map((m, i) => (
              <Text key={i} variant="body" color="textSecondary">
                ✕ {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      {[
        ['Más fácil', alt.easier],
        ['Similar', alt.similar],
        ['Más difícil', alt.harder],
      ].map(([label, list]) =>
        (list as typeof alt.easier).length ? (
          <View key={label as string} style={styles.block}>
            <SectionHeader title={`Alternativa · ${label}`} />
            <View style={styles.wrap}>
              {(list as typeof alt.easier).map((a) => (
                <Chip key={a.id} label={a.name_es} selected={false} onPress={() => router.push(`/training/exercise/${a.id}`)} />
              ))}
            </View>
          </View>
        ) : null,
      )}

      <SectionHeader title="Tu evolución" />
      <Card>
        <Text variant="caption" color="textSecondary">
          {progress.metric === 'e1rm' ? 'Fuerza estimada (1RM, fórmula de Epley) por sesión — calculada con tus series registradas.' : `Mejor serie por sesión (${repsUnit(ex)}).`}
        </Text>
        <LineChart
          points={progress.points.map((p) => ({ label: p.date.slice(5).replace('-', '/'), value: p.value }))}
          color={colors.training}
          unit={progress.metric === 'e1rm' ? 'kg' : repsUnit(ex)}
          accessibilityLabel={`Evolución de ${ex.name_es}: ${progress.points.length} sesiones`}
          testID="exercise-progress"
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  block: { gap: spacing.sm },
});
