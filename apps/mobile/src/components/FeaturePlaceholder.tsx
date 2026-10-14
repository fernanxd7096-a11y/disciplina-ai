import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { phaseNotice, type Feature } from '@/lib/roadmap';
import { colors, spacing } from '@/theme';

type FeaturePlaceholderProps = {
  feature: Feature;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  emptyTitle: string;
  emptyDescription: string;
  /** Lo que incluirá el módulo, tomado de la especificación. */
  includes: string[];
  showHeader?: boolean;
  testID?: string;
};

/**
 * Pantalla de un módulo aún no implementado. Dice con claridad qué hará y en qué fase,
 * sin mostrar datos inventados ni botones que no funcionan.
 */
export function FeaturePlaceholder({
  feature,
  title,
  icon,
  emptyTitle,
  emptyDescription,
  includes,
  showHeader = true,
  testID,
}: FeaturePlaceholderProps) {
  return (
    <Screen testID={testID} edges={showHeader ? ['top'] : []}>
      {showHeader ? <ScreenHeader title={title} /> : null}
      <Card>
        <EmptyState icon={icon} title={emptyTitle} description={`${emptyDescription} ${phaseNotice(feature)}`} />
      </Card>
      <SectionHeader title="Incluirá" />
      <Card>
        {includes.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="ellipse" size={6} color={colors.accent} style={styles.dot} />
            <Text variant="body" color="textSecondary" style={styles.item}>
              {item}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { marginTop: 8 },
  item: { flex: 1 },
});
