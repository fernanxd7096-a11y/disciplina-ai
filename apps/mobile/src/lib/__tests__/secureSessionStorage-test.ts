import { createSecureSessionStorage, decrypt, encrypt, safeKey, type KeyValueStore } from '../secureSessionStorage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

// Determinista pero sin repetir secuencia entre llamadas (la app usa expo-crypto).
let counter = 0;
const randomBytes = (n: number) => Uint8Array.from({ length: n }, () => (counter++ * 37 + 11) % 256);

describe('secureSessionStorage', () => {
  const session = JSON.stringify({ access_token: 'eyJ.secreto.token', refresh_token: 'r3fr3sh', user: { email: 'ana@test.local' } });

  it('cifra y descifra de ida y vuelta', () => {
    const key = randomBytes(32);
    const cipher = encrypt(session, key);
    expect(cipher).not.toContain('secreto');
    expect(decrypt(cipher, key)).toBe(session);
  });

  it('guarda solo texto cifrado en el almacén grande y solo la clave en el seguro', async () => {
    const bulk = memoryStore();
    const secure = memoryStore();
    const storage = createSecureSessionStorage({ bulk, secure, randomBytes });

    await storage.setItem('sb-abc-auth-token', session);

    const bulkValues = [...bulk.data.values()].join();
    expect(bulkValues).not.toContain('secreto');
    expect(bulkValues).not.toContain('ana@test.local');
    expect([...secure.data.values()][0]).toMatch(/^[0-9a-f]{64}$/);
    await expect(storage.getItem('sb-abc-auth-token')).resolves.toBe(session);
  });

  it('usa una clave nueva en cada escritura', async () => {
    const secure = memoryStore();
    const storage = createSecureSessionStorage({ bulk: memoryStore(), secure, randomBytes });
    await storage.setItem('k', 'a');
    const first = [...secure.data.values()][0];
    await storage.setItem('k', 'a');
    expect([...secure.data.values()][0]).not.toBe(first);
  });

  it('devuelve null y limpia si falta la clave (p. ej. tras reinstalar)', async () => {
    const bulk = memoryStore();
    const secure = memoryStore();
    const storage = createSecureSessionStorage({ bulk, secure, randomBytes });
    await storage.setItem('k', session);
    secure.data.clear();
    await expect(storage.getItem('k')).resolves.toBeNull();
  });

  it('removeItem borra ambos almacenes', async () => {
    const bulk = memoryStore();
    const secure = memoryStore();
    const storage = createSecureSessionStorage({ bulk, secure, randomBytes });
    await storage.setItem('k', session);
    await storage.removeItem('k');
    expect(bulk.data.size + secure.data.size).toBe(0);
  });

  it('normaliza claves no válidas para SecureStore', () => {
    expect(safeKey('sb-abc:auth/token')).toBe('sb-abc_auth_token');
  });
});
