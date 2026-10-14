import aesjs from 'aes-js';

/**
 * Almacenamiento cifrado para la sesión de Supabase.
 *
 * SecureStore (Keystore de Android) es seguro pero limita cada valor a ~2 KB,
 * y una sesión con tokens puede superarlo. Por eso:
 *   1. Por cada escritura se genera una clave AES-256 aleatoria nueva.
 *   2. La sesión se cifra con AES-CTR y se guarda en AsyncStorage.
 *   3. Solo la clave (32 bytes) se guarda en SecureStore.
 * Sin acceso al Keystore del dispositivo, lo guardado en AsyncStorage es ilegible.
 */

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SecureSessionDeps = {
  /** Almacén grande sin cifrar (AsyncStorage). */
  bulk: KeyValueStore;
  /** Almacén pequeño cifrado por el sistema (SecureStore). */
  secure: KeyValueStore;
  randomBytes: (length: number) => Uint8Array;
};

const SECURE_PREFIX = 'disciplina.key.';
const BULK_PREFIX = 'disciplina.session.';

/** SecureStore solo acepta claves con [A-Za-z0-9._-]. */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function encrypt(plain: string, keyBytes: Uint8Array): string {
  const ctr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  return aesjs.utils.hex.fromBytes(ctr.encrypt(aesjs.utils.utf8.toBytes(plain)));
}

export function decrypt(cipherHex: string, keyBytes: Uint8Array): string {
  const ctr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
}

export function createSecureSessionStorage({ bulk, secure, randomBytes }: SecureSessionDeps): KeyValueStore {
  return {
    async getItem(key) {
      const k = safeKey(key);
      const [cipher, keyHex] = await Promise.all([
        bulk.getItem(BULK_PREFIX + k),
        secure.getItem(SECURE_PREFIX + k),
      ]);
      if (!cipher || !keyHex) return null;
      try {
        return decrypt(cipher, aesjs.utils.hex.toBytes(keyHex));
      } catch {
        // Datos corruptos o clave perdida (p. ej. reinstalación): se descarta la sesión.
        await Promise.all([bulk.removeItem(BULK_PREFIX + k), secure.removeItem(SECURE_PREFIX + k)]);
        return null;
      }
    },
    async setItem(key, value) {
      const k = safeKey(key);
      const keyBytes = randomBytes(32);
      const cipher = encrypt(value, keyBytes);
      await secure.setItem(SECURE_PREFIX + k, aesjs.utils.hex.fromBytes(keyBytes));
      await bulk.setItem(BULK_PREFIX + k, cipher);
    },
    async removeItem(key) {
      const k = safeKey(key);
      await Promise.all([bulk.removeItem(BULK_PREFIX + k), secure.removeItem(SECURE_PREFIX + k)]);
    },
  };
}
