export type TaskStatus = 'todo' | 'doing' | 'done';
/** 1 = urgente · 2 = alta · 3 = normal · 4 = baja */
export type TaskPriority = 1 | 2 | 3 | 4;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_at: string | null;
  status: TaskStatus;
  completed_at: string | null;
  rescheduled_count: number;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TaskInput = Pick<Task, 'title' | 'description' | 'priority' | 'due_at'>;

export type Tag = { id: string; user_id: string; name: string };
