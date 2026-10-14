import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

type AuthLayoutProps = { title: string; subtitle: string; children: ReactNode; footer?: ReactNode; testID?: string };

export function AuthLayout({ title, subtitle, children, footer, testID }: AuthLayoutProps) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen testID={testID} edges={['top', 'bottom']}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="flash" size={26} color={colors.accent} />
          </View>
          <Text variant="label" color="accent">
            Disciplina AI
          </Text>
        </View>
        <View style={styles.header}>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" color="textSecondary">
            {subtitle}
          </Text>
        </View>
        <View style={styles.form}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { gap: spacing.sm, marginTop: spacing.lg },
  form: { gap: spacing.lg, marginTop: spacing.md },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
});
