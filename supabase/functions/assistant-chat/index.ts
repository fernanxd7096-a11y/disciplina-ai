// POST { conversation_id?, message } → respuesta del asistente + propuestas de acción (pendientes de confirmar).
import { dailyLimit, getProvider } from '../_shared/ai/provider.ts';
import { Turn } from '../_shared/ai/types.ts';
import { HttpError } from '../_shared/http.ts';
import { consumeQuota, serveUser } from '../_shared/serve.ts';
import { buildContext } from './context.ts';
import { handleChat } from './handler.ts';

export default serveUser((body, { supabase }) =>
  handleChat(
    body,
    {
      consumeQuota: () => consumeQuota(supabase, 'chat', dailyLimit(Deno.env, 'chat')),
      privacy: async () => {
        const { data } = await supabase
          .from('privacy_settings')
          .select('ai_use_habits, ai_use_planner, ai_use_training, ai_use_nutrition')
          .maybeSingle();
        return {
          habits: data?.ai_use_habits ?? false,
          planner: data?.ai_use_planner ?? false,
          training: data?.ai_use_training ?? false,
          nutrition: data?.ai_use_nutrition ?? false,
        };
      },
      conversation: async (id, title) => {
        if (id) {
          const { data } = await supabase.from('ai_conversations').select('id').eq('id', id).maybeSingle();
          if (!data) throw new HttpError(404, 'conversation_not_found', 'La conversación no existe.');
          await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
          return id;
        }
        const { data, error } = await supabase.from('ai_conversations').insert({ title }).select('id').single();
        if (error) throw new Error(error.message);
        return data.id as string;
      },
      history: async (conversationId, limit) => {
        const { data, error } = await supabase
          .from('ai_messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse().map((m): Turn => ({ role: m.role, text: m.content }));
      },
      context: (privacy) => buildContext(supabase, privacy),
      pendingTaskIds: async (ids) => {
        const { data } = await supabase.from('tasks').select('id').in('id', ids).neq('status', 'done').is('deleted_at', null);
        return new Set(((data ?? []) as { id: string }[]).map((t) => t.id));
      },
      addMessage: async (conversationId, role, content) => {
        const { data, error } = await supabase
          .from('ai_messages')
          .insert({ conversation_id: conversationId, role, content })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return data.id as string;
      },
      addProposals: async (messageId, proposals) => {
        const { data, error } = await supabase
          .from('ai_action_proposals')
          .insert(proposals.map((p) => ({ message_id: messageId, ...p })))
          .select('id, action_type, payload');
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    },
    getProvider(Deno.env),
  ),
);
