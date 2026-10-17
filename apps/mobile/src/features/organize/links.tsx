import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Chip, Text } from '@/components/ui';
import { useEvents } from '@/features/events/api';
import { useNotes } from '@/features/notes/api';
import { displayTitle } from '@/features/notes/logic';
import { useUserTimeZone } from '@/features/profile/api';
import { useTasks } from '@/features/tasks/api';
import { useNow } from '@/hooks/useNow';
import { spacing } from '@/theme';

/** Vincular una nota con una tarea pendiente o un evento próximo (o desvincular). */
export function NoteLinkPicker({ taskId, eventId, onChange }: { taskId: string | null; eventId: string | null; onChange: (link: { task_id: string | null; event_id: string | null }) => void }) {
  const tz = useUserTimeZone();
  const now = useNow();
  const tasks = useTasks();
  const events = useEvents();
  const pending = (tasks.data ?? []).filter((t) => t.status !== 'done' || t.id === taskId).slice(0, 12);
  const upcoming = (events.data ?? []).filter((e) => new Date(e.ends_at).getTime() > now.getTime() || e.id === eventId).slice(0, 12);
  const fmt = (iso: string) => new Intl.DateTimeFormat('es-PE', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(iso));
  return (
    <View style={styles.wrap} testID="note-links">
      <Text variant="label" color="textSecondary">
        Vincular con una tarea
      </Text>
      <View style={styles.chips}>
        {pending.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Sin tareas pendientes.
          </Text>
        ) : (
          pending.map((t) => (
            <Chip key={t.id} label={t.title} icon="checkbox-outline" selected={taskId === t.id} onPress={() => onChange({ task_id: taskId === t.id ? null : t.id, event_id: eventId })} testID={`link-task-${t.id}`} />
          ))
        )}
      </View>
      <Text variant="label" color="textSecondary">
        Vincular con un evento
      </Text>
      <View style={styles.chips}>
        {upcoming.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Sin eventos próximos.
          </Text>
        ) : (
          upcoming.map((e) => (
            <Chip key={e.id} label={`${e.title} · ${fmt(e.starts_at)}`} icon="calendar-outline" selected={eventId === e.id} onPress={() => onChange({ task_id: taskId, event_id: eventId === e.id ? null : e.id })} testID={`link-event-${e.id}`} />
          ))
        )}
      </View>
    </View>
  );
}

/** Notas vinculadas a una tarea o evento (se abren con un toque). */
export function LinkedNotes({ taskId, eventId }: { taskId?: string; eventId?: string }) {
  const notes = useNotes();
  const linked = (notes.data ?? []).filter((n) => !n.deleted_at && ((taskId && n.task_id === taskId) || (eventId && n.event_id === eventId)));
  if (!linked.length) return null;
  return (
    <View style={styles.wrap} testID="linked-notes">
      <Text variant="label" color="textSecondary">
        Notas vinculadas
      </Text>
      <View style={styles.chips}>
        {linked.map((n) => (
          <Chip key={n.id} label={displayTitle(n)} icon="document-text-outline" selected={false} onPress={() => router.push({ pathname: '/note/[id]', params: { id: n.id } })} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
