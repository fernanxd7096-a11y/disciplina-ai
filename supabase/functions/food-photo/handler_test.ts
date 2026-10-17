import { assert, assertEquals, assertRejects } from '../_shared/testing.ts';

import { MockProvider } from '../_shared/ai/mock.ts';
import { HttpError } from '../_shared/http.ts';
import { FoodPhotoRepo, FoodRow, handleFoodPhoto } from './handler.ts';

const UID = '33333333-3333-4333-8333-333333333333';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const ARROZ: FoodRow = {
  id: 'f1', name_es: 'Arroz blanco cocido', source: 'usda', kcal_100g: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3, portion_g: 150, portion_label: '1 taza',
};

function fakeRepo(over: Partial<FoodPhotoRepo> & { keep?: boolean; bytes?: Uint8Array } = {}) {
  const log = { deleted: [] as string[], saved: [] as unknown[], quota: 0 };
  const repo: FoodPhotoRepo = {
    consumeQuota: async () => {
      log.quota++;
    },
    keepPhotos: async () => over.keep ?? false,
    downloadPhoto: async () => over.bytes ?? JPEG,
    deletePhoto: async (p) => {
      log.deleted.push(p);
    },
    searchFoods: async (q) => (q.includes('arroz') ? [ARROZ] : []),
    saveAnalysis: async (row) => {
      log.saved.push(row);
      return 'analysis-1';
    },
    ...over,
  };
  return { repo, log };
}

Deno.test('usa la base nutricional cuando el alimento coincide y la IA solo si no hay dato', async () => {
  const { repo, log } = fakeRepo();
  const r = await handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, new MockProvider());

  assertEquals(r.analysis_id, 'analysis-1');
  assertEquals(r.provider, 'mock');
  const [arroz, pollo] = r.items;
  assertEquals(arroz.source, 'database');
  assertEquals(arroz.food?.id, 'f1');
  assertEquals(arroz.kcal, 234); // 130 kcal/100 g × 180 g
  assertEquals([arroz.kcal_min, arroz.kcal_max], [182, 299]);
  assertEquals(pollo.source, 'ai_estimate');
  assertEquals(pollo.kcal, 198); // estimación de la IA: 165 × 1,2
  assertEquals(r.totals.kcal, 432);
  assertEquals(log.quota, 1);
});

Deno.test('por privacidad borra la foto al terminar y no guarda la ruta', async () => {
  const { repo, log } = fakeRepo();
  const r = await handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, new MockProvider());
  assertEquals(log.deleted, [`${UID}/abc123.jpg`]);
  assertEquals((log.saved[0] as { photo_path: unknown }).photo_path, null);
  assertEquals(r.photo_kept, false);
});

Deno.test('conserva la foto si el usuario lo eligió', async () => {
  const { repo, log } = fakeRepo({ keep: true });
  const r = await handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, new MockProvider());
  assertEquals(log.deleted, []);
  assertEquals((log.saved[0] as { photo_path: unknown }).photo_path, `${UID}/abc123.jpg`);
  assert(r.photo_kept);
});

Deno.test('rechaza rutas de otro usuario o con trucos', async () => {
  const { repo, log } = fakeRepo();
  for (const photo_path of [`44444444-4444-4444-8444-444444444444/abc123.jpg`, `${UID}/../x.jpg`, `${UID}/a.png`, '']) {
    const e = await assertRejects(() => handleFoodPhoto({ photo_path }, UID, repo, new MockProvider()), HttpError);
    assertEquals(e.code, 'invalid_input');
  }
  assertEquals(log.quota, 0);
});

Deno.test('no gasta cuota si el archivo no es JPEG, y registra el fallo', async () => {
  const { repo, log } = fakeRepo({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
  const e = await assertRejects(() => handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, new MockProvider()), HttpError);
  assertEquals(e.code, 'photo_not_jpeg');
  assertEquals(log.quota, 0);
  assertEquals((log.saved[0] as { status: string }).status, 'failed');
  assertEquals(log.deleted.length, 1);
});

Deno.test('una foto sin comida devuelve lista vacía', async () => {
  const { repo } = fakeRepo();
  const ai = new MockProvider({ vision: () => ({ is_food: false, items: [], warnings: [] }) });
  const r = await handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, ai);
  assertEquals(r.is_food, false);
  assertEquals(r.items, []);
});

Deno.test('una salida de IA inválida es un error controlado', async () => {
  const { repo } = fakeRepo();
  const ai = new MockProvider({ vision: () => ({ is_food: true, items: [{ name: 'x', grams: -5 }] }) });
  const e = await assertRejects(() => handleFoodPhoto({ photo_path: `${UID}/abc123.jpg` }, UID, repo, ai), HttpError);
  assertEquals(e.code, 'ai_bad_output');
});
