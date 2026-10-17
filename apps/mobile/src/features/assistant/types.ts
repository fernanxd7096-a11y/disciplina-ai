export type Conversation = { id: string; title: string; created_at: string; updated_at: string };

export type ChatMessage = { id: string; conversation_id: string; role: 'user' | 'assistant'; content: string; created_at: string };

export type ActionType = 'create_task' | 'create_event' | 'create_habit' | 'reschedule_tasks' | 'complete_task';

export type Proposal = {
  id: string;
  message_id: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  status: 'pending' | 'applied' | 'rejected';
  applied_at: string | null;
};

export type ChatResponse = {
  provider: string;
  model: string;
  conversation_id: string;
  message: { id: string; role: 'assistant'; content: string };
  proposals: { id: string; action_type: ActionType; payload: Record<string, unknown> }[];
  context_used: string[];
};
