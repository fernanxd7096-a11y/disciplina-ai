import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, Card, Notice, Screen, SectionHeader, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/api';
import { NotificationSettings } from '@/features/reminders/NotificationSettings';
import { useDeviceTimeZone } from '@/hooks/useDeviceTimeZone';
import { colors, spacing } from '@/theme';
import { DataSection, DisciplineSection, GoalsSection, NameSection, PrivacySection } from './sections';

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

function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const deviceZone = useDeviceTimeZone();
  const [signingOut, setSigningOut] = useState(false);
  const version = Constants.expoConfig?.version ?? '—';

  const profileZone = profile.data?.timezone;
  const zoneDiffers = profileZone !== undefined && profileZone !== deviceZone;

  async function handleSignOut() {
    if (!(await confirm('Cerrar sesión', 'Tus datos quedan guardados en tu cuenta.', 'Cerrar sesión'))) return;
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  }

  return (
    <Screen testID="settings-screen" edges={[]}>
      <SectionHeader title="Cuenta" />
      <Card>
        <Row first label="Correo" value={user?.email ?? '—'} />
        <NameSection />
      </Card>

      <GoalsSection />

      <SectionHeader title="Región" />
      <Card>
        <Row first label="Zona horaria" value={profileZone ?? (profile.isLoading ? 'Cargando…' : '—')} />
        <Row label="Idioma" value="Español" />
        <Row label="Unidades" value="Métricas (kg, cm)" />
        <Row label="Tema" value="Oscuro (único disponible)" />
        {zoneDiffers ? (
          <View style={styles.zoneHint}>
            <Text variant="caption" color="textSecondary">
              Tu teléfono está en {deviceZone}. Las fechas y recordatorios usan la zona de tu perfil.
            </Text>
            <Button
              label={`Usar ${deviceZone}`}
              variant="secondary"
              icon="locate-outline"
              loading={updateProfile.isPending}
              onPress={() => updateProfile.mutate({ timezone: deviceZone })}
              testID="use-device-timezone"
            />
          </View>
        ) : null}
      </Card>
      {profile.isError ? <Notice tone="error" message="No se pudo cargar tu perfil. Revisa tu conexión." /> : null}
      {updateProfile.isError ? <Notice tone="error" message="No se pudo guardar el cambio." /> : null}

      <NotificationSettings />

      <DisciplineSection />
      <PrivacySection />
      <DataSection />

      <Button
        label="Cerrar sesión"
        icon="log-out-outline"
        variant="danger"
        onPress={handleSignOut}
        loading={signingOut}
        fullWidth
        testID="sign-out"
      />

      <SectionHeader title="Acerca de" />
      <Card>
        <Row first label="Versión" value={version} />
        <Row label="Asistente de IA" value="Proveedor configurado en el servidor" />
        <Text variant="caption" color="textMuted">
          La app nunca guarda claves de IA. El proveedor (Gemini) y sus límites se configuran en las Edge Functions de Supabase.
        </Text>
        <Text variant="caption" color="textMuted">
          Datos nutricionales: USDA FoodData Central. Las cifras de calorías son aproximadas.
        </Text>
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
  zoneHint: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
