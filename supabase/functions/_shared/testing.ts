// Aserciones mínimas sobre node:assert (incluido en Deno, sin descargas).
import { deepStrictEqual, ok } from 'node:assert/strict';

export const assertEquals = (actual: unknown, expected: unknown, msg?: string) => deepStrictEqual(actual, expected, msg);
export const assert = (v: unknown, msg?: string) => ok(v, msg);

export async function assertRejects<E extends Error>(fn: () => Promise<unknown>, cls: new (...a: never[]) => E): Promise<E> {
  try {
    await fn();
  } catch (e) {
    ok(e instanceof cls, `se esperaba ${cls.name}, llegó ${e}`);
    return e as E;
  }
  throw new Error('se esperaba que fallara');
}
