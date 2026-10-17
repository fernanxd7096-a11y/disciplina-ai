import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useSessionClient } from '@/features/auth/AuthProvider';

export type Privacy = {
  ai_use_habits: boolean;
  ai_use_planner: boolean;
  ai_use_training: boolean;
  ai_use_nutrition: boolean;
  keep_food_photos: boolean;
};

const PRIVACY_COLS = 'ai_use_habits, ai_use_planner, ai_use_training, ai_use_nutrition, keep_food_photos';
const DEFAULT_PRIVACY: Privacy = { ai_use_habits: true, ai_use_planner: true, ai_use_training: true, ai_use_nutrition: true, keep_food_photos: false };

export function usePrivacy() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: ['privacy', user.id],
    queryFn: async (): Promise<Privacy> => {
      const { data, error } = await client.from('privacy_settings').select(PRIVACY_COLS).maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_PRIVACY, ...((data as Privacy | null) ?? {}) };
    },
  });
}

export function useUpdatePrivacy() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Privacy>) => {
      const { data, error } = await client.from('privacy_settings').update(patch).eq('user_id', user.id).select(PRIVACY_COLS).single();
      if (error) throw error;
      return data as Privacy;
    },
    onMutate: async (patch) => {
      const key = ['privacy', user.id];
      const prev = qc.getQueryData<Privacy>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(['privacy', user.id], ctx.prev),
    onSuccess: (p) => qc.setQueryData(['privacy', user.id], p),
  });
}

/** Tablas que se exportan (todas las del usuario). Los catálogos globales no son datos suyos. */
export const EXPORT_TABLES = [
  'profiles', 'notification_prefs', 'privacy_settings', 'habits', 'habit_logs', 'rest_days', 'categories', 'tags',
  'notes', 'note_tags', 'tasks', 'task_tags', 'events', 'reminders', 'fitness_profiles', 'exercises', 'workout_plans',
  'plan_exercises', 'workout_sessions', 'set_logs', 'foods', 'meals', 'meal_items', 'food_analyses', 'nutrition_goals',
  'weight_logs', 'user_achievements', 'ai_conversations', 'ai_messages', 'ai_action_proposals', 'ai_usage',
] as const;

export async function collectExport(client: SupabaseClient, userId: string) {
  const out: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) {
    let q = client.from(t).select('*');
    if (t === 'exercises' || t === 'foods') q = q.eq('owner_id', userId);
    const { data, error } = await q;
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = data ?? [];
  }
  return { app: 'DISCIPLINA AI', exported_at: new Date().toISOString(), user_id: userId, format: 1, tables: out };
}

/** Genera un JSON con todos tus datos y abre el menú para compartirlo o guardarlo. */
export function useExportData() {
  const { client, user } = useSessionClient();
  return useMutation({
    mutationFn: async () => {
      const data = await collectExport(client, user.id);
      const file = new File(Paths.cache, `disciplina-ai-${data.exported_at.slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exportar mis datos' });
      return { uri: file.uri, rows: Object.values(data.tables).reduce((a, r) => a + r.length, 0) };
    },
  });
}

/**
 * Borra la cuenta: primero las fotos de comida (Storage), luego el usuario y,
 * en cascada en la base, todos sus datos. No se puede deshacer.
 */
export async function deleteAccount(client: SupabaseClient, userId: string) {
  const bucket = client.storage.from('food-photos');
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) throw new Error(`fotos: ${error.message}`);
    if (!data?.length) break;
    const { error: e2 } = await bucket.remove(data.map((f) => `${userId}/${f.name}`));
    if (e2) throw new Error(`fotos: ${e2.message}`);
    if (data.length < 100) break;
  }
  const { error } = await client.rpc('delete_my_account');
  if (error) throw error;
}
