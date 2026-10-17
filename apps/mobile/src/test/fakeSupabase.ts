/**
 * Supabase falso en memoria para pruebas de pantallas.
 * Implementa el subconjunto de supabase-js que usa la app (auth + consultas
 * encadenadas) y simula RLS: cada consulta solo ve filas del usuario conectado.
 * No reemplaza las pruebas reales de base de datos (supabase/tests).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Listener = (event: string, session: FakeSession | null) => void;

export type FakeSession = { access_token: string; user: { id: string; email: string } };

type Filter = (row: Row) => boolean;

/** Valores por defecto de columnas, copiados de la migración SQL. */
const TABLE_DEFAULTS: Record<string, Row> = {
  habits: {
    icon: null, color: null, category: null, frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6],
    target_per_period: 1, unit: null, reminder_time: null, status: 'active', sort_order: 0,
  },
  habit_logs: { value: 1, note: null },
  rest_days: { reason: null },
  tasks: { description: null, priority: 3, due_at: null, status: 'todo', completed_at: null, rescheduled_count: 0, category_id: null },
  notes: { title: '', body: '', pinned: false, archived_at: null, category_id: null, task_id: null, event_id: null },
  events: { all_day: false, location: null, notes: null, timezone: 'America/Lima', category_id: null },
  reminders: { event_id: null, task_id: null, offset_minutes: null, remind_at: null, enabled: true },
  workout_plans: { source: 'manual', notes: null, active: false },
  plan_exercises: { rest_seconds: 90, suggested_kg: null, sort_order: 0 },
  workout_sessions: { plan_id: null, day_index: null, finished_at: null, perceived_effort: null, notes: null },
  set_logs: { weight_kg: 0 },
  meals: { origin: 'manual', analysis_id: null, photo_path: null, notes: null },
  meal_items: { food_id: null, is_ai_estimate: false, user_edited: false },
  ai_conversations: { title: 'Conversación' },
  ai_action_proposals: { status: 'pending', applied_at: null },
};

/** Tablas con filas globales (owner_id nulo) visibles para todos, como en la RLS real. */
const GLOBAL_TABLES = new Set(['exercises', 'foods']);

type RpcHandler = (args: Record<string, unknown>, fake: FakeSupabase) => { data: unknown; error: unknown } | unknown;
type FunctionHandler = (body: unknown, fake: FakeSupabase) => { data?: unknown; error?: { message: string; context?: unknown } | null } | Promise<{ data?: unknown; error?: { message: string; context?: unknown } | null }>;

function normalize(s: unknown) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

let idCounter = 0;
export function fakeId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  session: FakeSession | null = null;
  users: Record<string, { id: string; password: string }> = {};
  /** Si se define, la próxima operación de auth falla con este error. */
  nextAuthError: { message: string; code?: string } | null = null;
  /** Tablas cuyas consultas fallan (simula errores de red). */
  failingTables = new Set<string>();
  private listeners = new Set<Listener>();
  calls: { table: string; op: string; payload?: unknown }[] = [];
  /** Archivos subidos a Storage: "bucket/ruta" → bytes. */
  files = new Map<string, unknown>();
  /** Respuestas de Edge Functions por nombre (las pruebas las definen). */
  functionHandlers: Record<string, FunctionHandler> = {};
  functionCalls: { name: string; body: unknown }[] = [];
  rpcHandlers: Record<string, RpcHandler> = {
    search_foods: ({ q, max_results }, fake) => {
      const term = normalize(q);
      const uid = fake.session?.user.id;
      return fake
        .rows('foods')
        .filter((f) => (f.owner_id == null || f.owner_id === uid) && normalize(f.name_es).includes(term))
        .slice(0, Number(max_results ?? 20));
    },
    my_progress_counts: (_a, fake) => {
      const uid = fake.session?.user.id;
      const mine = (t: string) => fake.rows(t).filter((r) => r.user_id === uid && !r.deleted_at);
      const meals = mine('meals');
      return {
        tasks_done: mine('tasks').filter((t) => t.status === 'done').length,
        habit_logs: mine('habit_logs').filter((l) => Number(l.value) > 0).length,
        workouts: mine('workout_sessions').filter((s) => s.finished_at).length,
        meals: meals.length,
        meal_days: new Set(meals.map((m) => String(m.eaten_at).slice(0, 10))).size,
        weight_logs: mine('weight_logs').length,
        notes: mine('notes').length,
        photo_meals: meals.filter((m) => m.origin === 'photo').length,
      };
    },
    delete_my_account: (_a, fake) => {
      const uid = fake.session?.user.id;
      for (const t of Object.keys(fake.tables)) fake.tables[t] = fake.tables[t].filter((r) => r.user_id !== uid && r.owner_id !== uid);
      return null;
    },
  };

  constructor(opts: { signedInAs?: string } = {}) {
    if (opts.signedInAs) this.signInAs(opts.signedInAs);
  }

  signInAs(email: string) {
    const id = this.users[email]?.id ?? fakeId();
    this.users[email] ??= { id, password: 'Secreta123' };
    this.session = { access_token: 'fake', user: { id, email } };
    this.ensureProfile(id);
  }

  ensureProfile(userId: string, displayName: string | null = null) {
    const profiles = (this.tables.profiles ??= []);
    if (!profiles.some((p) => p.user_id === userId)) {
      profiles.push({ user_id: userId, display_name: displayName, timezone: 'America/Lima', locale: 'es-PE', units: 'metric' });
    }
  }

  seed(table: string, rows: Row[]) {
    (this.tables[table] ??= []).push(...rows);
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  private emit(event: string) {
    for (const l of this.listeners) l(event, this.session);
  }

  private takeAuthError() {
    const e = this.nextAuthError;
    this.nextAuthError = null;
    return e;
  }

  auth = {
    getSession: async () => ({ data: { session: this.session }, error: null }),
    onAuthStateChange: (cb: Listener) => {
      this.listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => this.listeners.delete(cb) } } };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const err = this.takeAuthError();
      if (err) return { data: { session: null }, error: err };
      const u = this.users[email];
      if (!u || u.password !== password) {
        return { data: { session: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
      }
      this.signInAs(email);
      this.emit('SIGNED_IN');
      return { data: { session: this.session }, error: null };
    },
    signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: { display_name?: string } } }) => {
      const err = this.takeAuthError();
      if (err) return { data: { session: null, user: null }, error: err };
      if (this.users[email]) {
        return { data: { session: null, user: null }, error: { message: 'User already registered', code: 'user_already_exists' } };
      }
      const id = fakeId();
      this.users[email] = { id, password };
      this.ensureProfile(id, options?.data?.display_name ?? null);
      // Simula proyecto con confirmación de correo obligatoria.
      return { data: { session: null, user: { id, email } }, error: null };
    },
    resetPasswordForEmail: async () => ({ data: {}, error: this.takeAuthError() }),
    signOut: async () => {
      this.session = null;
      this.emit('SIGNED_OUT');
      return { error: null };
    },
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  };

  from(table: string) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.calls.push({ table: `rpc:${name}`, op: 'rpc', payload: args });
    if (!this.session) return { data: null, error: { message: 'permission denied', code: '42501' } };
    const h = this.rpcHandlers[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no simulada` } };
    return { data: h(args, this) ?? null, error: null };
  }

  functions = {
    invoke: async (name: string, opts: { body?: unknown } = {}) => {
      this.functionCalls.push({ name, body: opts.body });
      const h = this.functionHandlers[name];
      if (!h) return { data: null, error: { message: 'Function not found', context: { status: 404 } } };
      const r = await h(opts.body, this);
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: unknown) => {
        const uid = this.session?.user.id;
        if (!uid || !path.startsWith(`${uid}/`)) return { data: null, error: { message: 'new row violates row-level security policy' } };
        this.files.set(`${bucket}/${path}`, body);
        return { data: { path }, error: null };
      },
      list: async (prefix: string) => {
        const uid = this.session?.user.id;
        if (!uid || prefix !== uid) return { data: [], error: null };
        const names = [...this.files.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}/`)).map((k) => ({ name: k.slice(bucket.length + prefix.length + 2) }));
        return { data: names, error: null };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) this.files.delete(`${bucket}/${p}`);
        return { data: paths.map((name) => ({ name })), error: null };
      },
      createSignedUrl: async (path: string) =>
        this.files.has(`${bucket}/${path}`)
          ? { data: { signedUrl: `https://fake.storage/${bucket}/${path}` }, error: null }
          : { data: null, error: { message: 'Object not found' } },
    }),
  };

  /** Para pasarlo donde se espera un SupabaseClient. */
  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private singleMode: 'single' | 'maybe' | null = null;
  private orderBy: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private returning = false;
  private onConflict: string[] = [];

  constructor(private db: FakeSupabase, private table: string) {}

  select(_cols?: string) {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    this.onConflict = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim());
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
  neq(col: string, v: unknown) { this.filters.push((r) => r[col] !== v); return this; }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  is(col: string, v: null | boolean) { this.filters.push((r) => (r[col] ?? null) === v); return this; }
  not(col: string, op: string, v: unknown) {
    if (op === 'is') this.filters.push((r) => (r[col] ?? null) !== v);
    return this;
  }
  gte(col: string, v: unknown) { this.filters.push((r) => String(r[col]) >= String(v)); return this; }
  lte(col: string, v: unknown) { this.filters.push((r) => String(r[col]) <= String(v)); return this; }
  gt(col: string, v: unknown) { this.filters.push((r) => String(r[col]) > String(v)); return this; }
  lt(col: string, v: unknown) { this.filters.push((r) => String(r[col]) < String(v)); return this; }
  ilike(col: string, pattern: string) {
    const needle = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push((r) => String(r[col] ?? '').toLowerCase().includes(needle));
    return this;
  }
  or(expr: string) {
    // Soporta "a.ilike.%x%,b.ilike.%x%"
    const parts = expr.split(',').map((p) => p.split('.'));
    this.filters.push((r) =>
      parts.some(([col, op, ...rest]) => {
        const val = rest.join('.');
        if (op === 'ilike') return String(r[col] ?? '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
        if (op === 'eq') return String(r[col]) === val;
        if (op === 'neq') return String(r[col]) !== val;
        if (op === 'gte') return r[col] !== null && r[col] !== undefined && String(r[col]) >= val;
        if (op === 'lte') return r[col] !== null && r[col] !== undefined && String(r[col]) <= val;
        return false;
      }),
    );
    return this;
  }
  textSearch(col: string, query: string) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    this.filters.push((r) => words.every((w) => `${r.title ?? ''} ${r.body ?? ''}`.toLowerCase().includes(w)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy.push({ col, asc: opts?.ascending ?? true }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  private uid() {
    return this.db.session?.user.id ?? null;
  }

  private visible(): Row[] {
    const uid = this.uid();
    const all = this.db.tables[this.table] ?? [];
    if (GLOBAL_TABLES.has(this.table)) return all.filter((r) => r.owner_id == null || r.owner_id === uid);
    return all.filter((r) => r.user_id === uid);
  }

  /** Lo que se puede modificar: en catálogos, solo filas propias (las globales son de solo lectura). */
  private writable(): Row[] {
    const uid = this.uid();
    if (GLOBAL_TABLES.has(this.table)) return (this.db.tables[this.table] ?? []).filter((r) => r.owner_id === uid);
    return this.visible();
  }

  private exec(): { data: unknown; error: unknown } {
    this.db.calls.push({ table: this.table, op: this.op, payload: this.op === 'update' ? this.patch : this.payload });
    if (this.db.failingTables.has(this.table)) return { data: null, error: { message: 'Network request failed' } };
    const uid = this.uid();
    if (!uid) return { data: null, error: { message: 'permission denied', code: '42501' } };
    const store = (this.db.tables[this.table] ??= []);
    const now = new Date().toISOString();
    let result: Row[] = [];

    if (this.op === 'insert' || this.op === 'upsert') {
      for (const p of this.payload) {
        if (p.user_id && p.user_id !== uid) return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } };
        const row: Row = {
          id: fakeId(),
          user_id: uid,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          ...TABLE_DEFAULTS[this.table],
          ...p,
        };
        if (this.op === 'upsert') {
          const existing = store.find((r) => r.user_id === uid && this.onConflict.every((c) => r[c] === row[c]));
          if (existing) { Object.assign(existing, p, { updated_at: now }); result.push(existing); continue; }
        }
        store.push(row);
        result.push(row);
      }
    } else {
      let rows = (this.op === 'select' ? this.visible() : this.writable()).filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') {
        rows.forEach((r) => Object.assign(r, this.patch, { updated_at: now }));
      } else if (this.op === 'delete') {
        this.db.tables[this.table] = store.filter((r) => !rows.includes(r));
      }
      for (const o of [...this.orderBy].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[o.col] ?? '';
          const bv = b[o.col] ?? '';
          return (av < bv ? -1 : av > bv ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      result = rows;
    }

    if ((this.op === 'insert' || this.op === 'update' || this.op === 'upsert' || this.op === 'delete') && !this.returning && !this.singleMode) {
      return { data: null, error: null };
    }
    const copy = result.map((r) => ({ ...r }));
    if (this.singleMode) {
      if (copy.length === 1) return { data: copy[0], error: null };
      if (copy.length === 0 && this.singleMode === 'maybe') return { data: null, error: null };
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    return { data: copy, error: null };
  }

  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.exec()).then(onFulfilled, onRejected);
  }
}
