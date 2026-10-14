export type Note = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived_at: string | null;
  task_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Minúsculas y sin acentos, para buscar "educacion" y encontrar "Educación". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Todas las palabras de la búsqueda deben aparecer en el título o el cuerpo. */
export function matchesQuery(note: Pick<Note, 'title' | 'body'>, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${note.title} ${note.body}`);
  return words.every((w) => haystack.includes(w));
}

/** Fijadas primero; luego las editadas más recientemente. Archivadas aparte. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

export function filterNotes(notes: Note[], query: string, archived: boolean): Note[] {
  return sortNotes(notes.filter((n) => !n.deleted_at && Boolean(n.archived_at) === archived && matchesQuery(n, query)));
}

/** Título a mostrar: el propio, o la primera línea del cuerpo. */
export function displayTitle(note: Pick<Note, 'title' | 'body'>): string {
  if (note.title.trim()) return note.title.trim();
  const first = note.body.trim().split('\n')[0];
  return first ? first.slice(0, 80) : 'Nota sin título';
}

/** Vista previa del cuerpo sin repetir la línea usada como título. */
export function preview(note: Pick<Note, 'title' | 'body'>): string {
  const body = note.body.trim();
  const text = note.title.trim() ? body : body.split('\n').slice(1).join(' ');
  return text.replace(/\s+/g, ' ').slice(0, 140);
}

export function isEmptyNote(n: Pick<Note, 'title' | 'body'>): boolean {
  return !n.title.trim() && !n.body.trim();
}
