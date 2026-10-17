import { assertEquals, assertRejects } from '../testing.ts';

import { HttpError } from '../http.ts';
import { GeminiProvider } from './gemini.ts';
import { dailyLimit, DEFAULT_GEMINI_MODEL, getProvider } from './provider.ts';
import { AIResponseError, GenerateJsonRequest } from './types.ts';

const REQ: GenerateJsonRequest = {
  purpose: 'vision',
  system: 'sistema',
  history: [{ role: 'assistant', text: 'hola' }],
  parts: [{ image: { mimeType: 'image/jpeg', base64: 'AAAA' } }, { text: 'analiza' }],
  schema: { type: 'OBJECT' },
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { fn, calls };
}

Deno.test('arma la petición generateContent con imagen, historial y esquema', async () => {
  const { fn, calls } = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  const out = await new GeminiProvider('clave', 'gemini-x', fn).generateJson(REQ);
  assertEquals(out, { ok: true });
  assertEquals(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
  assertEquals((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], 'clave');
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.contents[0], { role: 'model', parts: [{ text: 'hola' }] });
  assertEquals(body.contents[1].parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } });
  assertEquals(body.generationConfig.responseMimeType, 'application/json');
  assertEquals(body.system_instruction.parts[0].text, 'sistema');
});

Deno.test('la clave nunca va en la URL', async () => {
  const { fn, calls } = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] });
  await new GeminiProvider('secreto123', 'm', fn).generateJson(REQ);
  assertEquals(calls[0].url.includes('secreto123'), false);
});

Deno.test('ignora las partes de razonamiento y une el texto', async () => {
  const { fn } = fakeFetch(200, {
    candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: '{"a":' }, { text: '1}' }] } }],
  });
  assertEquals(await new GeminiProvider('k', 'm', fn).generateJson(REQ), { a: 1 });
});

Deno.test('traduce errores del proveedor a códigos estables', async () => {
  const cases: [number, unknown, string][] = [
    [429, {}, 'rate_limited'],
    [403, { error: 'API key not valid' }, 'misconfigured'],
    [500, {}, 'upstream'],
    [200, { promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    [200, { candidates: [{ finishReason: 'SAFETY' }] }, 'blocked'],
    [200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a":' }] } }] }, 'bad_output'],
  ];
  for (const [status, body, code] of cases) {
    const { fn } = fakeFetch(status, body);
    const e = await assertRejects(() => new GeminiProvider('k', 'm', fn).generateJson(REQ), AIResponseError);
    assertEquals(e.code, code);
  }
});

Deno.test('sin clave la IA queda desactivada con un error claro (no se simula)', () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
  try {
    getProvider(env({}));
    throw new Error('debía fallar');
  } catch (e) {
    assertEquals((e as HttpError).code, 'ai_not_configured');
  }
  assertEquals(getProvider(env({ AI_PROVIDER: 'mock' })).name, 'mock');
  const g = getProvider(env({ GEMINI_API_KEY: 'k' }));
  assertEquals([g.name, g.model], ['gemini', DEFAULT_GEMINI_MODEL]);
  assertEquals(getProvider(env({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'otro' })).model, 'otro');
  assertEquals(dailyLimit(env({}), 'vision'), 15);
  assertEquals(dailyLimit(env({ AI_DAILY_LIMIT_VISION: '3' }), 'vision'), 3);
  assertEquals(dailyLimit(env({ AI_DAILY_LIMIT_VISION: '-1' }), 'vision'), 15);
});
