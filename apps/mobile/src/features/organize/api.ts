import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';

export type Category = { id: string; name: string; color: string | null; scope: 'note' | 'task' | 'event' };
export type Tag = { id: string; name: string };
export type ItemKind = 'note' | 'task';

export const organizeKeys = {
  categories: (uid: string) => ['categories', uid] as const,
  tags: (uid: string) => ['tags', uid] as const,
  links: (uid: string, kind: ItemKind) => ['itemTags', uid, kind] as const,
};

export function useCategories() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: organizeKeys.categories(user.id),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await client.from('categories').select('id, name, color, scope').is('deleted_at', null).order('name');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export function useTags() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: organizeKeys.tags(user.id),
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await client.from('tags').select('id, name').is('deleted_at', null).order('name');
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
}

/** Relación elemento ↔ etiqueta de todas las notas (o tareas) del usuario. */
export function useItemTags(kind: ItemKind) {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: organizeKeys.links(user.id, kind),
    queryFn: async (): Promise<{ item_id: string; tag_id: string }[]> => {
      const { data, error } = await client.from(`${kind}_tags`).select(`${kind}_id, tag_id`);
      if (error) throw error;
      return ((data ?? []) as Record<string, string>[]).map((r) => ({ item_id: r[`${kind}_id`], tag_id: r.tag_id }));
    },
  });
}

export function useCreateCategory() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { name: string; scope: Category['scope'] }) => {
      const { data, error } = await client.from('categories').insert({ name: c.name.trim(), scope: c.scope }).select('id, name, color, scope').single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: (c) => qc.setQueryData<Category[]>(organizeKeys.categories(user.id), (old = []) => [...old, c].sort((a, b) => a.name.localeCompare(b.name))),
  });
}

export function useCreateTag() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim().replace(/^#/, '');
      const existing = (qc.getQueryData<Tag[]>(organizeKeys.tags(user.id)) ?? []).find((t) => t.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const { data, error } = await client.from('tags').insert({ name: clean }).select('id, name').single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: (t) => qc.setQueryData<Tag[]>(organizeKeys.tags(user.id), (old = []) => (old.some((x) => x.id === t.id) ? old : [...old, t].sort((a, b) => a.name.localeCompare(b.name)))),
  });
}

export function useToggleTag(kind: ItemKind) {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const key = organizeKeys.links(user.id, kind);
  return useMutation({
    mutationFn: async ({ itemId, tagId, on }: { itemId: string; tagId: string; on: boolean }) => {
      const table = `${kind}_tags`;
      const { error } = on
        ? await client.from(table).insert({ [`${kind}_id`]: itemId, tag_id: tagId })
        : await client.from(table).delete().eq(`${kind}_id`, itemId).eq('tag_id', tagId);
      if (error) throw error;
      return { itemId, tagId, on };
    },
    onSuccess: ({ itemId, tagId, on }) =>
      qc.setQueryData<{ item_id: string; tag_id: string }[]>(key, (old = []) =>
        on ? [...old, { item_id: itemId, tag_id: tagId }] : old.filter((l) => !(l.item_id === itemId && l.tag_id === tagId)),
      ),
  });
}
