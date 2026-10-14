import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

/** Estado vacío honesto: explica qué falta y ofrece la acción siguiente real. */
export function EmptyState({ icon, title, description, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={styles.box} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="textSecondary" align="center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={styles.box} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

type ErrorStateProps = { message: string; onRetry?: () => void };

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
      </View>
      <Text variant="heading" align="center">
        Algo salió mal
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {message}
      </Text>
      {onRetry ? <Button label="Reintentar" icon="refresh" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
