import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { useUserTimeZone } from '@/features/profile/api';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, greeting } from '@/lib/dates';
import { phaseNotice, type Feature } from '@/lib/roadmap';
import { colors, spacing } from '@/theme';

type DomainRow = {
  key: Feature;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
};

const domains: DomainRow[] = [
  { key: 'habits', label: 'Hábitos', icon: 'flame-outline', color: colors.habits },
  { key: 'tasks', label: 'Tareas', icon: 'checkbox-outline', color: colors.tasks },
  { key: 'training', label: 'Entrenamiento', icon: 'barbell-outline', color: colors.training },
  { key: 'nutrition', label: 'Nutrición', icon: 'nutrition-outline', color: colors.nutrition },
];

export function DashboardScreen() {
  const now = useNow();
  const timeZone = useUserTimeZone();

  return (
    <Screen testID="dashboard-screen">
      <ScreenHeader
        subtitle={formatLongDate(now, timeZone)}
        title={greeting(now, timeZone)}
        right={
          <IconButton
            icon="settings-outline"
            accessibilityLabel="Abrir ajustes"
            onPress={() => router.push('/settings')}
          />
        }
      />

      <Card>
        <View style={styles.progressRow}>
          <ProgressRing value={0} total={0} accessibilityLabel="Progreso del día: sin objetivos todavía">
            <Text variant="metric" color="textMuted">
              —
            </Text>
          </ProgressRing>
          <View style={styles.progressText}>
            <Text variant="heading">Progreso de hoy</Text>
            <Text variant="caption" color="textSecondary">
              Aquí verás el porcentaje de hábitos y tareas completados hoy, calculado con tus propios
              registros.
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Resumen del día" />
      <Card>
        {domains.map((d, i) => (
          <View key={d.key} style={[styles.domainRow, i > 0 && styles.divider]}>
            <View style={[styles.domainIcon, { borderColor: d.color }]}>
              <Ionicons name={d.icon} size={18} color={d.color} />
            </View>
            <View style={styles.domainText}>
              <Text variant="bodyStrong">{d.label}</Text>
              <Text variant="caption" color="textMuted">
                {phaseNotice(d.key)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Próximo evento" />
      <Card>
        <Text variant="body" color="textSecondary">
          Cuando agendes eventos, aquí aparecerá el siguiente y el tiempo que falta.
        </Text>
        <Text variant="caption" color="textMuted">
          {phaseNotice('calendar')}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label="Asistente"
          icon="sparkles-outline"
          variant="secondary"
          grow
          onPress={() => router.push('/assistant')}
          testID="open-assistant"
        />
        <Button
          label="Estadísticas"
          icon="stats-chart-outline"
          variant="secondary"
          grow
          onPress={() => router.push('/stats')}
          testID="open-stats"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  progressText: { flex: 1, gap: spacing.xs },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  domainIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  domainText: { flex: 1, gap: spacing.xxs },
  actions: { flexDirection: 'row', gap: spacing.md },
});
