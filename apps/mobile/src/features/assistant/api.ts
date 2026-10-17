import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { eventKeys, type NotificationPrefsRow } from '@/features/events/api';
import { habitKeys, useToday } from '@/features/habits/api';
import { useUserTimeZone } from '@/features/profile/api';
import { taskKeys } from '@/features/tasks/api';
import { zonedToUtcIso } from '@/features/tasks/logic';
import { invokeAI } from '@/lib/ai';
import { dueAt } from './logic';
import type { ChatMessage, ChatResponse, Conversation, Proposal } from './types';

export const assistantKeys = {
  conversations: (uid: string) => ['aiConversations', uid] as const,
  messages: (uid: string, cid: string) => ['aiMessages', uid, cid] as const,
  proposals: (uid: string, cid: string) => ['aiProposals', uid, cid] as const,
};

export function useConversations() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: assistantKeys.conversations(user.id),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await client.from('ai_conversations').select('id, title, created_at, updated_at').order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });
}

export function useMessages(conversationId: string | null) {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: assistantKeys.messages(user.id, conversationId ?? 'none'),
    enabled: !!conversationId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await client.from('ai_messages').select('id, conversation_id, role, content, created_at').eq('conversation_id', conversationId!).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });
}

export function useProposals(conversationId: string | null, messageIds: string[]) {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: [...assistantKeys.proposals(user.id, conversationId ?? 'none'), messageIds.length],
    enabled: !!conversationId && messageIds.length > 0,
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await client.from('ai_action_proposals').select('id, message_id, action_type, payload, status, applied_at').in('message_id', messageIds);
      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });
}

/** Envía un mensaje. El historial y las propuestas los guarda la Edge Function con la sesión del usuario. */
export function useSendMessage() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversation_id: string | null; message: string }) =>
      invokeAI<ChatResponse>(client, 'assistant-chat', { conversation_id: input.conversation_id, message: input.message }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: assistantKeys.conversations(user.id) });
      void qc.invalidateQueries({ queryKey: assistantKeys.messages(user.id, r.conversation_id) });
      void qc.invalidateQueries({ queryKey: assistantKeys.proposals(user.id, r.conversation_id) });
    },
  });
}

/**
 * Aplica una propuesta CON LA SESIÓN DEL USUARIO (RLS): el modelo nunca escribe
 * directamente en la base. Solo se ejecutan los 5 tipos de acción conocidos.
 */
export function useApplyProposal(conversationId: string) {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  const tz = useUserTimeZone();
  const today = useToday();
  return useMutation({
    mutationFn: async (p: Proposal) => {
      if (p.status !== 'pending') throw new Error('Esta propuesta ya se resolvió.');
      const x = p.payload as Record<string, unknown>;
      const str = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : null);
      let error: { message: string } | null = null;
      switch (p.action_type) {
        case 'create_task':
          ({ error } = await client.from('tasks').insert({
            title: str('title')!.trim(),
            description: str('description')?.trim() || null,
            priority: Number(x.priority ?? 3),
            due_at: str('due_date') ? dueAt(str('due_date')!, str('due_time'), tz) : null,
          }));
          break;
        case 'create_event': {
          const { data, error: e } = await client
            .from('events')
            .insert({
              title: str('title')!.trim(),
              starts_at: zonedToUtcIso(str('date')!, str('start_time')!, tz),
              ends_at: zonedToUtcIso(str('date')!, str('end_time')!, tz),
              all_day: false,
              location: str('location')?.trim() || null,
              notes: str('notes')?.trim() || null,
              timezone: tz,
            })
            .select('id')
            .single();
          error = e;
          if (!e && data) {
            // Mismos avisos predeterminados que un evento creado a mano.
            const prefs = qc.getQueryData<NotificationPrefsRow>(eventKeys.prefs(user.id));
            const offsets = prefs?.default_event_offsets ?? [15, 60];
            if (offsets.length) ({ error } = await client.from('reminders').insert(offsets.map((o) => ({ event_id: (data as { id: string }).id, offset_minutes: o }))));
          }
          break;
        }
        case 'create_habit':
          ({ error } = await client.from('habits').insert({
            name: str('name')!.trim(),
            category: str('category') ?? 'other',
            frequency: str('frequency') ?? 'daily',
            days_of_week: (x.days_of_week as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
            target_per_period: Number(x.target_per_period ?? 1),
            reminder_time: str('reminder_time'),
            start_date: today,
            sort_order: 999,
          }));
          break;
        case 'reschedule_tasks': {
          const due = dueAt(str('due_date')!, str('due_time'), tz);
          for (const id of (x.task_ids as string[]) ?? []) {
            const { data: t } = await client.from('tasks').select('rescheduled_count, due_at').eq('id', id).maybeSingle();
            const r = await client
              .from('tasks')
              .update({ due_at: due, rescheduled_count: Number((t as { rescheduled_count?: number } | null)?.rescheduled_count ?? 0) + ((t as { due_at?: string } | null)?.due_at ? 1 : 0) })
              .eq('id', id)
              .neq('status', 'done');
            if (r.error) {
              error = r.error;
              break;
            }
          }
          break;
        }
        case 'complete_task':
          ({ error } = await client.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', str('task_id')!));
          break;
        default:
          throw new Error('Acción no permitida.');
      }
      if (error) throw error;
      const { error: e2 } = await client.from('ai_action_proposals').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', p.id);
      if (e2) throw e2;
      return p;
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: assistantKeys.proposals(user.id, conversationId) });
      if (p.action_type === 'create_habit') void qc.invalidateQueries({ queryKey: habitKeys.all(user.id) });
      if (p.action_type === 'create_event') {
        void qc.invalidateQueries({ queryKey: eventKeys.all(user.id) });
        void qc.invalidateQueries({ queryKey: eventKeys.reminders(user.id) });
      }
      if (['create_task', 'reschedule_tasks', 'complete_task'].includes(p.action_type)) void qc.invalidateQueries({ queryKey: taskKeys.all(user.id) });
    },
  });
}

export function useRejectProposal(conversationId: string) {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Proposal) => {
      const { error } = await client.from('ai_action_proposals').update({ status: 'rejected' }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: assistantKeys.proposals(user.id, conversationId) }),
  });
}

export function useDeleteConversation() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      // Mensajes y propuestas se borran en cascada.
      const q = client.from('ai_conversations').delete();
      const { error } = id === 'all' ? await q.not('id', 'is', null) : await q.eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) =>
      qc.setQueryData<Conversation[]>(assistantKeys.conversations(user.id), (old = []) => (id === 'all' ? [] : old.filter((c) => c.id !== id))),
  });
}
