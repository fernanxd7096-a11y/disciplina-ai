import { useLocalSearchParams } from 'expo-router';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useNotes } from '@/features/notes/api';
import { NoteEditorScreen } from '@/features/notes/NoteEditorScreen';

export default function NoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useNotes();
  const note = data?.find((n) => n.id === id);
  if (!note) {
    return (
      <Screen edges={[]}>
        {isLoading ? <LoadingState /> : <EmptyState icon="help-circle-outline" title="Esta nota ya no existe" />}
      </Screen>
    );
  }
  return <NoteEditorScreen note={note} />;
}
