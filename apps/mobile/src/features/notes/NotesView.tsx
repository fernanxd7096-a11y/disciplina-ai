import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, Chip, EmptyState, ErrorState, LoadingState, Text } from '@/components/ui';
import { colors, minTouchSize, radius, spacing, typography } from '@/theme';
import { useNotes } from './api';
import { OrganizeFilter, useOrganizeMatcher, type OrganizeSelection } from '@/features/organize/OrganizeFilter';
import { displayTitle, filterNotes, preview } from './logic';

export function NotesView() {
  const notes = useNotes();
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [org, setOrg] = useState<OrganizeSelection>({ categoryId: null, tagId: null });
  const matches = useOrganizeMatcher('note', org);
  const list = filterNotes(notes.data ?? [], query, archived).filter(matches);
  const total = notes.data?.length ?? 0;

  if (notes.isLoading) return <LoadingState label="Cargando notas…" />;
  if (notes.error && !notes.data) {
    return <ErrorState message="No se pudieron cargar tus notas. Revisa tu conexión." onRetry={() => notes.refetch()} />;
  }
  if (total === 0) {
    return (
      <Card>
        <EmptyState
          icon="document-text-outline"
          title="Sin notas"
          description="Apuntes de clase, ideas o listas. Se guardan solas mientras escribes."
          actionLabel="Nueva nota"
          onAction={() => router.push('/note/new')}
          testID="planner-empty-notes"
        />
      </Card>
    );
  }

  return (
    <View style={styles.wrap} testID="notes-view">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar en tus notas"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel="Buscar en tus notas"
          returnKeyType="search"
          testID="notes-search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <OrganizeFilter kind="note" value={org} onChange={setOrg} />
      <View style={styles.filters}>
        <Chip label="Activas" selected={!archived} onPress={() => setArchived(false)} />
        <Chip label="Archivadas" icon="archive-outline" selected={archived} onPress={() => setArchived(true)} testID="notes-archived" />
      </View>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={query ? 'search-outline' : 'archive-outline'}
            title={query ? 'Sin resultados' : 'Nada archivado'}
            description={query ? `Ninguna nota contiene "${query.trim()}".` : undefined}
          />
        </Card>
      ) : (
        list.map((n) => (
          <Card
            key={n.id}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: n.id } })}
            accessibilityLabel={`${displayTitle(n)}. Abrir nota.`}
            testID={`note-${n.id}`}>
            <View style={styles.noteHead}>
              {n.pinned ? <Ionicons name="pin" size={14} color={colors.accent} /> : null}
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {displayTitle(n)}
              </Text>
              <Text variant="caption" color="textMuted">
                {new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' }).format(new Date(n.updated_at)).replace('.', '')}
              </Text>
            </View>
            {preview(n) ? (
              <Text variant="caption" color="textSecondary" numberOfLines={2}>
                {preview(n)}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchSize,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.text, minHeight: minTouchSize },
  filters: { flexDirection: 'row', gap: spacing.sm },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
