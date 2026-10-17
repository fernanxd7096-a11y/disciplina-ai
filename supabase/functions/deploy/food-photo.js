// _shared/http.ts
var HttpError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message), this.status = status, this.code = code;
  }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
function errorResponse(e) {
  if (e instanceof HttpError) return json({
    error: {
      code: e.code,
      message: e.message
    }
  }, e.status);
  console.error("error no controlado", e);
  return json({
    error: {
      code: "internal",
      message: "Error interno."
    }
  }, 500);
}
function parseInput(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, "invalid_input", r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}
async function readBody(req) {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Usa POST.");
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "El cuerpo no es JSON v\xE1lido.");
  }
}

// _shared/ai/types.ts
var AIResponseError = class extends Error {
  code;
  constructor(code, message) {
    super(message), this.code = code;
  }
};

// _shared/ai/gemini.ts
var BASE = "https://generativelanguage.googleapis.com/v1beta/models";
var GeminiProvider = class {
  apiKey;
  model;
  fetchFn;
  timeoutMs;
  name;
  constructor(apiKey, model, fetchFn = fetch, timeoutMs = 45e3) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
    this.name = "gemini";
  }
  buildBody(req) {
    const contents = [
      ...(req.history ?? []).map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: t.text
          }
        ]
      })),
      {
        role: "user",
        parts: req.parts.map((p) => "text" in p ? {
          text: p.text
        } : {
          inline_data: {
            mime_type: p.image.mimeType,
            data: p.image.base64
          }
        })
      }
    ];
    return {
      system_instruction: {
        parts: [
          {
            text: req.system
          }
        ]
      },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: req.schema,
        temperature: req.purpose === "chat" ? 0.6 : 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 4096
      }
    };
  }
  async generateJson(req) {
    let res;
    try {
      res = await this.fetchFn(`${BASE}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(this.buildBody(req)),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (e) {
      if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new AIResponseError("timeout", "La IA tard\xF3 demasiado en responder.");
      }
      throw new AIResponseError("upstream", "No se pudo contactar al servicio de IA.");
    }
    if (res.status === 429) throw new AIResponseError("rate_limited", "El servicio de IA alcanz\xF3 su l\xEDmite. Intenta m\xE1s tarde.");
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      console.error("gemini", res.status, (await res.text()).slice(0, 500));
      throw new AIResponseError("misconfigured", "El servicio de IA no est\xE1 bien configurado.");
    }
    if (!res.ok) throw new AIResponseError("upstream", `El servicio de IA fall\xF3 (${res.status}).`);
    const data = await res.json();
    if (data.promptFeedback?.blockReason) throw new AIResponseError("blocked", "La IA no pudo procesar este contenido.");
    const cand = data.candidates?.[0];
    if (!cand) throw new AIResponseError("bad_output", "La IA no devolvi\xF3 respuesta.");
    if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") {
      throw new AIResponseError("blocked", "La IA no pudo procesar este contenido.");
    }
    const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
    try {
      return JSON.parse(text);
    } catch {
      throw new AIResponseError("bad_output", cand.finishReason === "MAX_TOKENS" ? "La respuesta de la IA qued\xF3 incompleta." : "La IA devolvi\xF3 un formato inv\xE1lido.");
    }
  }
};

// _shared/ai/mock.ts
var MockProvider = class {
  overrides;
  name;
  model;
  calls;
  constructor(overrides = {}) {
    this.overrides = overrides;
    this.name = "mock";
    this.model = "mock";
    this.calls = [];
  }
  generateJson(req) {
    this.calls.push(req);
    const fn = this.overrides[req.purpose] ?? DEFAULTS[req.purpose];
    return Promise.resolve(fn(req));
  }
};
var DEFAULTS = {
  vision: () => ({
    is_food: true,
    items: [
      {
        name: "Arroz blanco",
        search_terms: "arroz blanco cocido",
        grams: 180,
        grams_min: 140,
        grams_max: 230,
        confidence: "medium",
        preparation: "cocido",
        ai_per_100g: {
          kcal: 130,
          protein_g: 2.7,
          carbs_g: 28,
          fat_g: 0.3
        }
      },
      {
        name: "Pollo a la plancha",
        search_terms: "pechuga de pollo cocida",
        grams: 120,
        grams_min: 90,
        grams_max: 150,
        confidence: "medium",
        preparation: "a la plancha",
        ai_per_100g: {
          kcal: 165,
          protein_g: 31,
          carbs_g: 0,
          fat_g: 3.6
        }
      }
    ],
    warnings: [
      "Modo prueba: este resultado es fijo y no analiza tu foto."
    ]
  }),
  plan: (r) => {
    const last = r.parts.filter((p) => "text" in p).at(-1);
    const codes = [
      ...last?.text.matchAll(/"code":"([a-z0-9_]+)"/g) ?? []
    ].map((m) => m[1]);
    const days = Number(/"days_per_week":(\d)/.exec(last?.text ?? "")?.[1] ?? 3);
    return {
      name: "Rutina de prueba",
      notes: "Modo prueba: rutina fija para desarrollo.",
      safety_notes: [],
      days: Array.from({
        length: days
      }, (_, i) => ({
        label: `D\xEDa ${i + 1}`,
        exercises: codes.slice(i % Math.max(codes.length, 1), i % Math.max(codes.length, 1) + 3).map((code) => ({
          code,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          rest_seconds: 90,
          suggested_kg: null
        }))
      }))
    };
  },
  chat: () => ({
    reply: "Modo prueba: la IA no est\xE1 conectada. As\xED se ver\xEDa una respuesta del asistente.",
    actions: []
  })
};

// _shared/ai/provider.ts
var DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
function getProvider(env) {
  const kind = (env.get("AI_PROVIDER") ?? "gemini").trim().toLowerCase();
  if (kind === "mock") return new MockProvider();
  if (kind === "gemini") {
    const key = env.get("GEMINI_API_KEY")?.trim();
    if (!key) throw new HttpError(503, "ai_not_configured", "La IA a\xFAn no est\xE1 configurada en el servidor.");
    return new GeminiProvider(key, env.get("GEMINI_MODEL")?.trim() || DEFAULT_GEMINI_MODEL);
  }
  throw new HttpError(503, "ai_not_configured", `Proveedor de IA desconocido: ${kind}`);
}
function dailyLimit(env, kind) {
  const defaults = {
    chat: 40,
    vision: 15,
    plan: 5
  };
  const raw = Number(env.get(`AI_DAILY_LIMIT_${kind.toUpperCase()}`));
  return Number.isInteger(raw) && raw >= 1 && raw <= 1e3 ? raw : defaults[kind];
}

// _shared/deps.ts
import { z } from "npm:zod@4.6.7";
import { createSupabaseContext } from "npm:@supabase/server@1.9.2";

// _shared/serve.ts
function aiErrorToHttp(e) {
  if (!(e instanceof AIResponseError)) return e;
  const status = {
    rate_limited: 429,
    blocked: 422,
    bad_output: 502,
    upstream: 502,
    misconfigured: 503,
    timeout: 504
  }[e.code];
  return new HttpError(status, `ai_${e.code}`, e.message);
}
function serveUser(handler) {
  return {
    fetch: async (req) => {
      try {
        const { data: ctx, error } = await createSupabaseContext(req, {
          auth: "user"
        });
        if (error || !ctx?.userClaims?.id) {
          return json({
            error: {
              code: "unauthorized",
              message: "Inicia sesi\xF3n de nuevo."
            }
          }, error?.status ?? 401);
        }
        const body = await readBody(req);
        return json(await handler(body, {
          supabase: ctx.supabase,
          userId: ctx.userClaims.id
        }));
      } catch (e) {
        return errorResponse(aiErrorToHttp(e));
      }
    }
  };
}
async function consumeQuota(supabase, kind, limit) {
  const { data, error } = await supabase.rpc("consume_ai_quota", {
    kind,
    daily_limit: limit
  });
  if (error) throw new Error(`consume_ai_quota: ${error.message}`);
  if (data !== true) {
    throw new HttpError(429, "quota_exceeded", `Alcanzaste el l\xEDmite diario de ${limit} usos. Se reinicia ma\xF1ana.`);
  }
}

// food-photo/handler.ts
var MAX_BYTES = 5 * 1024 * 1024;
var inputSchema = (userId) => z.object({
  photo_path: z.string().regex(new RegExp(`^${userId}/[A-Za-z0-9_-]{6,64}\\.jpg$`), "Ruta de foto no v\xE1lida.")
});
var per100 = z.object({
  kcal: z.number().min(0).max(900),
  protein_g: z.number().min(0).max(100),
  carbs_g: z.number().min(0).max(100),
  fat_g: z.number().min(0).max(100)
});
var aiItem = z.object({
  name: z.string().trim().min(1).max(80),
  search_terms: z.string().trim().min(2).max(80),
  grams: z.number().min(1).max(2e3),
  grams_min: z.number().min(1).max(2e3),
  grams_max: z.number().min(1).max(3e3),
  confidence: z.enum([
    "low",
    "medium",
    "high"
  ]),
  preparation: z.string().trim().max(60).nullable().optional(),
  ai_per_100g: per100
});
var aiOutput = z.object({
  is_food: z.boolean(),
  items: z.array(aiItem).max(12),
  warnings: z.array(z.string().max(200)).max(6).default([])
});
var OUTPUT_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_food: {
      type: "BOOLEAN",
      description: "false si la foto no muestra comida"
    },
    items: {
      type: "ARRAY",
      maxItems: 12,
      items: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING",
            description: "nombre com\xFAn en espa\xF1ol de Per\xFA"
          },
          search_terms: {
            type: "STRING",
            description: 'nombre gen\xE9rico para buscar en una tabla nutricional, p. ej. "arroz blanco cocido"'
          },
          grams: {
            type: "NUMBER",
            description: "mejor estimaci\xF3n del peso comestible en gramos"
          },
          grams_min: {
            type: "NUMBER"
          },
          grams_max: {
            type: "NUMBER"
          },
          confidence: {
            type: "STRING",
            enum: [
              "low",
              "medium",
              "high"
            ]
          },
          preparation: {
            type: "STRING",
            nullable: true,
            description: "frito, sancochado, a la plancha\u2026"
          },
          ai_per_100g: {
            type: "OBJECT",
            properties: {
              kcal: {
                type: "NUMBER"
              },
              protein_g: {
                type: "NUMBER"
              },
              carbs_g: {
                type: "NUMBER"
              },
              fat_g: {
                type: "NUMBER"
              }
            },
            required: [
              "kcal",
              "protein_g",
              "carbs_g",
              "fat_g"
            ]
          }
        },
        required: [
          "name",
          "search_terms",
          "grams",
          "grams_min",
          "grams_max",
          "confidence",
          "ai_per_100g"
        ]
      }
    },
    warnings: {
      type: "ARRAY",
      items: {
        type: "STRING"
      },
      description: "aceite, salsas o ingredientes ocultos que no se pueden ver"
    }
  },
  required: [
    "is_food",
    "items",
    "warnings"
  ]
};
var SYSTEM_PROMPT = `Eres un asistente de nutrici\xF3n. Analizas fotos de comida de un usuario en Per\xFA.
Identifica cada alimento visible por separado (no agrupes el plato entero si sus partes se distinguen).
Para cada uno estima el peso comestible en gramos con un rango realista (grams_min\u2013grams_max) y tu nivel de confianza.
Usa referencias visuales (tama\xF1o del plato, cubiertos, mano) cuando existan; si no hay, ampl\xEDa el rango y baja la confianza.
ai_per_100g son valores aproximados por 100 g; se usan solo si el alimento no est\xE1 en la base nutricional.
En warnings menciona lo que la foto no permite saber: aceite de cocci\xF3n, salsas, az\xFAcar a\xF1adida, ingredientes ocultos.
Nunca presentes las cifras como exactas. Si la imagen no muestra comida, responde is_food=false e items vac\xEDo.
No des consejos de dieta ni de ejercicio.`;
var round1 = (n) => Math.round(n * 10) / 10;
function macrosFor(per, grams) {
  const f = grams / 100;
  return {
    kcal: round1(per.kcal * f),
    protein_g: round1(per.protein_g * f),
    carbs_g: round1(per.carbs_g * f),
    fat_g: round1(per.fat_g * f)
  };
}
async function buildItems(raw, search) {
  const out = [];
  for (const it of raw.items) {
    const lo = Math.min(it.grams_min, it.grams);
    const hi = Math.max(it.grams_max, it.grams);
    const candidates = (await search(it.search_terms)).slice(0, 3);
    const food = candidates[0] ?? null;
    const per = food ? {
      kcal: Number(food.kcal_100g),
      protein_g: Number(food.protein_g),
      carbs_g: Number(food.carbs_g),
      fat_g: Number(food.fat_g)
    } : it.ai_per_100g;
    const m = macrosFor(per, it.grams);
    out.push({
      name: it.name,
      grams: Math.round(it.grams),
      grams_min: Math.round(lo),
      grams_max: Math.round(hi),
      confidence: it.confidence,
      preparation: it.preparation ?? null,
      source: food ? "database" : "ai_estimate",
      food,
      candidates,
      ai_per_100g: it.ai_per_100g,
      ...m,
      kcal_min: Math.round(macrosFor(per, lo).kcal),
      kcal_max: Math.round(macrosFor(per, hi).kcal)
    });
  }
  return out;
}
function totalsOf(items) {
  const sum = (k) => round1(items.reduce((a, i) => a + i[k], 0));
  return {
    kcal: Math.round(sum("kcal")),
    kcal_min: Math.round(sum("kcal_min")),
    kcal_max: Math.round(sum("kcal_max")),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g")
  };
}
function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function isJpeg(b) {
  return b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
}
async function handleFoodPhoto(body, userId, repo, ai) {
  const { photo_path } = parseInput(inputSchema(userId), body);
  const keep = await repo.keepPhotos();
  try {
    const bytes = await repo.downloadPhoto(photo_path);
    if (bytes.length > MAX_BYTES) throw new HttpError(413, "photo_too_large", "La foto pesa m\xE1s de 5 MB.");
    if (!isJpeg(bytes)) throw new HttpError(415, "photo_not_jpeg", "La foto debe ser JPEG.");
    await repo.consumeQuota();
    const raw = await ai.generateJson({
      purpose: "vision",
      system: SYSTEM_PROMPT,
      parts: [
        {
          image: {
            mimeType: "image/jpeg",
            base64: toBase64(bytes)
          }
        },
        {
          text: "Identifica los alimentos de esta foto y estima sus porciones."
        }
      ],
      schema: OUTPUT_SCHEMA,
      maxOutputTokens: 2048
    });
    const parsed = aiOutput.safeParse(raw);
    if (!parsed.success) throw new HttpError(502, "ai_bad_output", "La IA devolvi\xF3 un resultado incompleto. Intenta otra foto.");
    const items = parsed.data.is_food ? await buildItems(parsed.data, (q) => repo.searchFoods(q)) : [];
    const result = {
      provider: ai.name,
      model: ai.model,
      is_food: parsed.data.is_food && items.length > 0,
      items,
      totals: totalsOf(items),
      warnings: parsed.data.warnings,
      photo_kept: keep
    };
    const analysis_id = await repo.saveAnalysis({
      photo_path: keep ? photo_path : null,
      model: `${ai.name}:${ai.model}`,
      status: "done",
      result,
      error: null
    });
    return {
      analysis_id,
      ...result
    };
  } catch (e) {
    await repo.saveAnalysis({
      photo_path: null,
      model: `${ai.name}:${ai.model}`,
      status: "failed",
      result: null,
      error: e instanceof Error ? e.message.slice(0, 500) : "error"
    }).catch(() => {
    });
    throw e;
  } finally {
    if (!keep) await repo.deletePhoto(photo_path).catch((err) => console.error("no se pudo borrar la foto", err));
  }
}

// food-photo/index.ts
var food_photo_default = serveUser((body, { supabase, userId }) => handleFoodPhoto(body, userId, {
  consumeQuota: () => consumeQuota(supabase, "vision", dailyLimit(Deno.env, "vision")),
  keepPhotos: async () => {
    const { data } = await supabase.from("privacy_settings").select("keep_food_photos").maybeSingle();
    return data?.keep_food_photos === true;
  },
  downloadPhoto: async (path) => {
    const { data, error } = await supabase.storage.from("food-photos").download(path);
    if (error || !data) throw new Error(`No se encontr\xF3 la foto: ${error?.message ?? ""}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  deletePhoto: async (path) => {
    const { error } = await supabase.storage.from("food-photos").remove([
      path
    ]);
    if (error) throw error;
  },
  searchFoods: async (q) => {
    const { data, error } = await supabase.rpc("search_foods", {
      q,
      max_results: 3
    });
    if (error) throw new Error(`search_foods: ${error.message}`);
    return data ?? [];
  },
  saveAnalysis: async (row) => {
    const { data, error } = await supabase.from("food_analyses").insert(row).select("id").single();
    if (error) throw new Error(`food_analyses: ${error.message}`);
    return data.id;
  }
}, getProvider(Deno.env)));
export {
  food_photo_default as default
};
