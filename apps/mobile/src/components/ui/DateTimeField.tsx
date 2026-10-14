import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, minTouchSize, radius, spacing } from '@/theme';
import { Text } from './Text';

type DateTimeFieldProps = {
  label: string;
  /** Instante ISO o null. */
  value: string | null;
  /**
   * Recibe la fecha elegida como día local "AAAA-MM-DD" y hora "HH:MM"
   * (en la hora del teléfono); quien llama la convierte a la zona del perfil.
   */
  onChange: (day: string, time: string) => void;
  /** Texto ya formateado en la zona del perfil. */
  display: { date: string; time: string } | null;
  mode?: 'date' | 'datetime' | 'time';
  testID?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Campo de fecha (y opcionalmente hora) con el selector nativo del sistema. */
export function DateTimeField({ label, value, onChange, display, mode = 'datetime', testID }: DateTimeFieldProps) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const current = value ? new Date(value) : new Date();

  function handle(event: DateTimePickerEvent, selected?: Date) {
    const kind = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (event.type !== 'set' || !selected) {
      if (Platform.OS !== 'android') setPicker(null);
      return;
    }
    const base = kind === 'time' ? current : selected;
    const day = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    const timeSrc = kind === 'time' ? selected : value ? current : null;
    const time = timeSrc ? `${pad(timeSrc.getHours())}:${pad(timeSrc.getMinutes())}` : '23:59';
    onChange(day, time);
    if (Platform.OS !== 'android') setPicker(null);
  }

  return (
    <View style={styles.wrap}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View style={styles.row}>
        {mode !== 'time' ? (
          <Pressable
            style={[styles.field, styles.flex]}
            onPress={() => setPicker('date')}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${display?.date ?? 'sin fecha'}. Cambiar fecha.`}
            testID={testID ? `${testID}-date` : undefined}>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text variant="body" color={display ? 'text' : 'textMuted'}>
              {display?.date ?? 'Elegir fecha'}
            </Text>
          </Pressable>
        ) : null}
        {mode !== 'date' ? (
          <Pressable
            style={[styles.field, mode === 'time' && styles.flex]}
            onPress={() => setPicker('time')}
            accessibilityRole="button"
            accessibilityLabel={`Hora: ${display?.time ?? 'sin hora'}. Cambiar hora.`}
            testID={testID ? `${testID}-time` : undefined}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text variant="body" color={display ? 'text' : 'textMuted'}>
              {display?.time ?? '--:--'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {picker ? (
        <DateTimePicker
          value={current}
          mode={picker}
          is24Hour
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handle}
          themeVariant="dark"
          accentColor={colors.accent}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchSize,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
