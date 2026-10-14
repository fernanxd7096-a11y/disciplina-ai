import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { Card, Screen, SectionHeader, Text } from '@/components/ui';
import { useDeviceTimeZone } from '@/hooks/useDeviceTimeZone';
import { phaseNotice } from '@/lib/roadmap';
import { colors, spacing } from '@/theme';

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Text variant="body">{label}</Text>
      <Text variant="body" color="textSecondary" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const timeZone = useDeviceTimeZone();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen testID="settings-screen" edges={[]}>
      <SectionHeader title="Región" />
      <Card>
        <Row first label="Zona horaria" value={timeZone} />
        <Row label="Idioma" value="Español" />
        <Row label="Unidades" value="Métricas (kg, cm)" />
      </Card>
      <Text variant="caption" color="textMuted">
        Por ahora se usan los valores del dispositivo. Podrás cambiarlos en tu perfil. {phaseNotice('auth')}
      </Text>

      <SectionHeader title="Cuenta y privacidad" />
      <Card>
        <Text variant="body" color="textSecondary">
          Inicio de sesión, control de qué datos usa la IA, exportación y eliminación de tus datos.
        </Text>
        <Text variant="caption" color="textMuted">
          {phaseNotice('auth')}
        </Text>
      </Card>

      <SectionHeader title="Acerca de" />
      <Card>
        <Row first label="Versión" value={version} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 32,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
});
