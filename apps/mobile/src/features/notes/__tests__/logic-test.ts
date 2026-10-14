import { displayTitle, filterNotes, isEmptyNote, matchesQuery, normalize, preview, type Note } from '../logic';

function note(over: Partial<Note>): Note {
  return {
    id: Math.random().toString(36),
    user_id: 'u',
    title: '',
    body: '',
    pinned: false,
    archived_at: null,
    task_id: null,
    event_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('búsqueda de notas', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(normalize('Educación FÍSICA')).toBe('educacion fisica');
    expect(matchesQuery(note({ title: 'Educación física' }), 'educacion')).toBe(true);
  });

  it('exige todas las palabras, en título o cuerpo', () => {
    const n = note({ title: 'Tesis', body: 'Revisar capítulo de base de datos' });
    expect(matchesQuery(n, 'tesis datos')).toBe(true);
    expect(matchesQuery(n, 'tesis redes')).toBe(false);
    expect(matchesQuery(n, '   ')).toBe(true);
  });

  it('separa archivadas, quita borradas y pone fijadas primero', () => {
    const notes = [
      note({ id: 'vieja', updated_at: '2026-10-01T00:00:00Z' }),
      note({ id: 'nueva', updated_at: '2026-10-10T00:00:00Z' }),
      note({ id: 'fijada', pinned: true, updated_at: '2026-09-01T00:00:00Z' }),
      note({ id: 'archivada', archived_at: '2026-10-05T00:00:00Z' }),
      note({ id: 'borrada', deleted_at: '2026-10-05T00:00:00Z' }),
    ];
    expect(filterNotes(notes, '', false).map((n) => n.id)).toEqual(['fijada', 'nueva', 'vieja']);
    expect(filterNotes(notes, '', true).map((n) => n.id)).toEqual(['archivada']);
  });
});

describe('presentación', () => {
  it('usa la primera línea como título si no hay uno', () => {
    expect(displayTitle(note({ body: 'Comprar pan\nY leche' }))).toBe('Comprar pan');
    expect(preview(note({ body: 'Comprar pan\nY leche' }))).toBe('Y leche');
    expect(displayTitle(note({}))).toBe('Nota sin título');
  });

  it('detecta notas vacías', () => {
    expect(isEmptyNote(note({ title: '  ', body: '\n' }))).toBe(true);
    expect(isEmptyNote(note({ body: 'x' }))).toBe(false);
  });
});
