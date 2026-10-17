import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Notice, Text, TextField } from '@/components/ui';
import { spacing } from '@/theme';
import { useCategories, useCreateCategory, useCreateTag, useItemTags, useTags, useToggleTag, type ItemKind } from './api';

type Props = {
  kind: ItemKind;
  itemId: string;
  categoryId: string | null;
  onCategory: (id: string | null) => void;
};

/** Categoría (una) y etiquetas (varias) de una nota o tarea, con creación en línea. */
export function OrganizePanel({ kind, itemId, categoryId, onCategory }: Props) {
  const categories = useCategories();
  const tags = useTags();
  const links = useItemTags(kind);
  const createCategory = useCreateCategory();
  const createTag = useCreateTag();
  const toggle = useToggleTag(kind);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [newTag, setNewTag] = useState<string | null>(null);
  const mine = new Set((links.data ?? []).filter((l) => l.item_id === itemId).map((l) => l.tag_id));
  const cats = (categories.data ?? []).filter((c) => c.scope === kind);
  const failed = createCategory.isError || createTag.isError || toggle.isError;

  async function addCategory() {
    const name = (newCat ?? '').trim();
    if (!name) return;
    try {
      const c = await createCategory.mutateAsync({ name, scope: kind });
      onCategory(c.id);
      setNewCat(null);
    } catch {
      // aviso abajo
    }
  }

  async function addTag() {
    const name = (newTag ?? '').trim();
    if (!name) return;
    try {
      const t = await createTag.mutateAsync(name);
      if (!mine.has(t.id)) await toggle.mutateAsync({ itemId, tagId: t.id, on: true });
      setNewTag(null);
    } catch {
      // aviso abajo
    }
  }

  return (
    <View style={styles.wrap} testID={`organize-${kind}`}>
      <Text variant="label" color="textSecondary">
        Categoría
      </Text>
      <View style={styles.chips}>
        {cats.map((c) => (
          <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => onCategory(categoryId === c.id ? null : c.id)} testID={`cat-${c.name}`} />
        ))}
        {newCat === null ? <Chip label="+ Nueva" selected={false} onPress={() => setNewCat('')} testID="new-category" /> : null}
      </View>
      {newCat !== null ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="Nombre de la categoría" value={newCat} onChangeText={setNewCat} maxLength={40} autoFocus testID="new-category-name" />
          </View>
          <Button label="Crear" onPress={addCategory} loading={createCategory.isPending} testID="create-category" />
        </View>
      ) : null}

      <Text variant="label" color="textSecondary">
        Etiquetas
      </Text>
      <View style={styles.chips}>
        {(tags.data ?? []).map((t) => (
          <Chip key={t.id} label={`#${t.name}`} selected={mine.has(t.id)} onPress={() => toggle.mutate({ itemId, tagId: t.id, on: !mine.has(t.id) })} testID={`tag-${t.name}`} />
        ))}
        {newTag === null ? <Chip label="+ Etiqueta" selected={false} onPress={() => setNewTag('')} testID="new-tag" /> : null}
      </View>
      {newTag !== null ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="Etiqueta" value={newTag} onChangeText={setNewTag} maxLength={30} autoCapitalize="none" autoFocus testID="new-tag-name" />
          </View>
          <Button label="Agregar" onPress={addTag} loading={createTag.isPending} testID="create-tag" />
        </View>
      ) : null}
      {failed ? <Notice tone="error" message="No se pudo guardar. ¿Ya existe ese nombre o estás sin conexión?" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
});
