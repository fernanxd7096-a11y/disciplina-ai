import { AIProvider, AIResponseError, GenerateJsonRequest } from './types.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type Fetch = typeof fetch;

/** Adaptador para la API de Gemini (models.generateContent con salida JSON). */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  constructor(
    private apiKey: string,
    readonly model: string,
    private fetchFn: Fetch = fetch,
    private timeoutMs = 45_000,
  ) {}

  buildBody(req: GenerateJsonRequest) {
    const contents = [
      ...(req.history ?? []).map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
      {
        role: 'user',
        parts: req.parts.map((p) =>
          'text' in p ? { text: p.text } : { inline_data: { mime_type: p.image.mimeType, data: p.image.base64 } },
        ),
      },
    ];
    return {
      system_instruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: req.schema,
        temperature: req.purpose === 'chat' ? 0.6 : 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
      },
    };
  }

  async generateJson(req: GenerateJsonRequest): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${BASE}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(this.buildBody(req)),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new AIResponseError('timeout', 'La IA tardó demasiado en responder.');
      }
      throw new AIResponseError('upstream', 'No se pudo contactar al servicio de IA.');
    }

    if (res.status === 429) throw new AIResponseError('rate_limited', 'El servicio de IA alcanzó su límite. Intenta más tarde.');
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      // Clave inválida, modelo inexistente o petición rechazada: es configuración, no culpa del usuario.
      console.error('gemini', res.status, (await res.text()).slice(0, 500));
      throw new AIResponseError('misconfigured', 'El servicio de IA no está bien configurado.');
    }
    if (!res.ok) throw new AIResponseError('upstream', `El servicio de IA falló (${res.status}).`);

    const data = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    if (data.promptFeedback?.blockReason) throw new AIResponseError('blocked', 'La IA no pudo procesar este contenido.');
    const cand = data.candidates?.[0];
    if (!cand) throw new AIResponseError('bad_output', 'La IA no devolvió respuesta.');
    if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
      throw new AIResponseError('blocked', 'La IA no pudo procesar este contenido.');
    }
    const text = (cand.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new AIResponseError(
        'bad_output',
        cand.finishReason === 'MAX_TOKENS' ? 'La respuesta de la IA quedó incompleta.' : 'La IA devolvió un formato inválido.',
      );
    }
  }
}
