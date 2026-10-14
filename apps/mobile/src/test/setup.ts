import { FakeSupabase } from './fakeSupabase';

type G = { __fakeSupabase?: FakeSupabase };

/** Instala un Supabase falso para la prueba actual y lo devuelve. */
export function setFakeSupabase(fake: FakeSupabase | null = new FakeSupabase()): FakeSupabase | null {
  (globalThis as G).__fakeSupabase = fake ?? undefined;
  return fake;
}

/** Atajo: Supabase falso con un usuario ya conectado. */
export function signedInFake(email = 'ana@test.local'): FakeSupabase {
  const fake = new FakeSupabase({ signedInAs: email });
  setFakeSupabase(fake);
  return fake;
}

afterEach(() => {
  (globalThis as G).__fakeSupabase = undefined;
});
