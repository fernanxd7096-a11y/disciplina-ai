import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import type { Note } from './logic';

const NOTE_COLS = 'id, user_id, title, body, pinned, archived_at, task_id, event_id, category_id, created_at, updated_at, deleted_at';

export const noteKeys = { all: (uid: string) => ['notes', uid] as const };

export function useNotes() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: noteKeys.all(user.id),
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await client
        .from('notes')
        .select(NOTE_COLS)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
}

type NotePatch = Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'archived_at' | 'deleted_at' | 'task_id' | 'event_id' | 'category_id'>>;

/**
 * Guardar una nota: crea si aún no tiene id, actualiza si ya existe.
 * Las escrituras de notas van en orden para que el autoguardado nunca
 * pise un cambio más reciente con uno anterior.
 */
export function useSaveNote() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const key = noteKeys.all(user.id);

  return useMutation({
    scope: { id: `notes-${user.id}` },
    mutationFn: async ({ id, patch }: { id: string | null; patch: NotePatch }): Promise<Note> => {
      if (id) {
        const { data, error } = await client.from('notes').update(patch).eq('id', id).select(NOTE_COLS).single();
        if (error) throw error;
        return data as Note;
      }
      const { data, error } = await client.from('notes').insert(patch).select(NOTE_COLS).single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (note) => {
      qc.setQueryData<Note[]>(key, (old = []) => {
        const others = old.filter((n) => n.id !== note.id);
        return note.deleted_at ? others : [note, ...others];
      });
    },
  });
}
