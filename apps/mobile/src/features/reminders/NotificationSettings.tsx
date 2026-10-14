import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Notice, SectionHeader, Text } from '@/components/ui';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/features/events/api';
import { reminderOptions } from '@/features/events/logic';
import { colors, spacing } from '@/theme';
import { getPermission, requestPermission, type PermissionState } from './notifications';

export function NotificationSettings() {
  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    getPermission()
      .then(setPermission)
      .catch(() => setPermission('undetermined'));
  }, []);

  async function enable() {
    if (permission === 'denied') {
      // El sistema ya no muestra el diálogo: hay que activarlo en los ajustes del teléfono.
      await Linking.openSettings();
      return;
    }
    setPermission(await requestPermission().catch(() => 'denied' as const));
  }

  const data = prefs.data;
  const offsets = data?.default_event_offsets ?? [];

  return (
    <>
      <SectionHeader title="Notificaciones" />
      <Card testID="notification-settings">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Permiso del teléfono</Text>
            <Text variant="caption" color={permission === 'granted' ? 'success' : 'textSecondary'} testID="notification-permission">
              {permission === null
                ? 'Comprobando…'
                : permission === 'granted'
                  ? 'Activado'
                  : permission === 'denied'
                    ? 'Bloqueado en los ajustes del teléfono'
                    : 'Sin activar'}
            </Text>
          </View>
          {permission && permission !== 'granted' ? (
            <Button label={permission === 'denied' ? 'Abrir ajustes' : 'Activar'} variant="secondary" onPress={enable} testID="enable-notifications" />
          ) : null}
        </View>

        {data ? (
          <>
            <View style={[styles.block, styles.divider]}>
              <Text variant="bodyStrong">Qué avisarme</Text>
              <View style={styles.wrap}>
                <Chip
                  label="Hábitos"
                  icon="flame-outline"
                  selected={data.habit_reminders}
                  onPress={() => update.mutate({ habit_reminders: !data.habit_reminders })}
                  testID="pref-habits"
                />
                <Chip
                  label="Tareas"
                  icon="checkbox-outline"
                  selected={data.task_reminders}
                  onPress={() => update.mutate({ task_reminders: !data.task_reminders })}
                  testID="pref-tasks"
                />
              </View>
              <Text variant="caption" color="textMuted">
                Los avisos de eventos se configuran en cada evento.
              </Text>
            </View>

            <View style={[styles.block, styles.divider]}>
              <Text variant="bodyStrong">Avisos predeterminados para eventos nuevos</Text>
              <View style={styles.wrap}>
                {reminderOptions.map((o) => {
                  const on = offsets.includes(o.minutes);
                  return (
                    <Chip
                      key={o.minutes}
                      label={o.label}
                      selected={on}
                      onPress={() =>
                        update.mutate({
                          default_event_offsets: on ? offsets.filter((m) => m !== o.minutes) : [...offsets, o.minutes].sort((a, b) => a - b),
                        })
                      }
                      testID={`pref-offset-${o.minutes}`}
                    />
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
      </Card>
      {update.isError ? <Notice tone="error" message="No se pudo guardar la preferencia." /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  block: { gap: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
