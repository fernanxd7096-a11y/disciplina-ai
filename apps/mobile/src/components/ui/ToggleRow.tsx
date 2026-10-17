import { StyleSheet, Switch, View } from 'react-native';

import { colors, minTouchSize, spacing } from '@/theme';
import { Text } from './Text';

type Props = { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string };

/** Fila con interruptor (accesible como "switch"). */
export function ToggleRow({ label, hint, value, onChange, disabled, testID }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceRaised, true: colors.accentStrong }}
        thumbColor={value ? colors.accent : colors.textSecondary}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTouchSize },
  text: { flex: 1, gap: spacing.xxs },
});
