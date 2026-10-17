import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { spacing } from '@/theme';
import { useCategories, useItemTags, useTags, type ItemKind } from './api';

export type OrganizeSelection = { categoryId: string | null; tagId: string | null };

/** Predicado para filtrar elementos por la categoría o etiqueta elegida. */
export function useOrganizeMatcher(kind: ItemKind, sel: OrganizeSelection) {
  const links = useItemTags(kind);
  return (item: { id: string; category_id?: string | null }) => {
    if (sel.categoryId && item.category_id !== sel.categoryId) return false;
    if (sel.tagId && !(links.data ?? []).some((l) => l.item_id === item.id && l.tag_id === sel.tagId)) return false;
    return true;
  };
}

/** Fila de filtros por categoría y etiqueta (solo aparece si el usuario creó alguna). */
export function OrganizeFilter({ kind, value, onChange }: { kind: ItemKind; value: OrganizeSelection; onChange: (v: OrganizeSelection) => void }) {
  const cats = (useCategories().data ?? []).filter((c) => c.scope === kind);
  const tags = useTags().data ?? [];
  if (!cats.length && !tags.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID={`filter-${kind}`}>
      {cats.map((c) => (
        <Chip key={c.id} compact label={c.name} icon="folder-outline" selected={value.categoryId === c.id} onPress={() => onChange({ ...value, categoryId: value.categoryId === c.id ? null : c.id })} testID={`filter-cat-${c.name}`} />
      ))}
      {tags.map((t) => (
        <Chip key={t.id} compact label={`#${t.name}`} selected={value.tagId === t.id} onPress={() => onChange({ ...value, tagId: value.tagId === t.id ? null : t.id })} testID={`filter-tag-${t.name}`} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: spacing.sm, paddingRight: spacing.lg } });
