// Genera la migración del catálogo global (alimentos y ejercicios) a partir
// de los CSV de esta carpeta. Uso: node supabase/seed/build.mjs
//
// foods_usda.csv: valores por 100 g transcritos de USDA FoodData Central
// (SR Legacy). `usda_description` es la descripción exacta del registro, para
// verificarlo con supabase/seed/verify-usda.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'migrations', '20261015000200_seed_catalog.sql');

function rows(file, columns, { joinRest = false } = {}) {
  const lines = readFileSync(join(here, file), 'utf8').trim().split('\n');
  const header = lines[0].split(';');
  if (header.join(';') !== columns.join(';')) throw new Error(`${file}: encabezado inesperado`);
  return lines.slice(1).map((line, i) => {
    let cells = line.split(';');
    if (joinRest && cells.length > columns.length) {
      cells = [...cells.slice(0, columns.length - 1), cells.slice(columns.length - 1).join(';')];
    }
    if (cells.length !== columns.length) throw new Error(`${file}:${i + 2}: ${cells.length} columnas`);
    return Object.fromEntries(columns.map((c, j) => [c, cells[j].trim()]));
  });
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`número inválido: ${s}`);
  return String(n);
};

const foods = rows('foods_usda.csv', [
  'name_es', 'usda_description', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'portion_g', 'portion_label',
]);

// Control de coherencia: las kcal deben parecerse a 4·P + 4·C + 9·G (factores de
// Atwater generales). USDA usa factores específicos por alimento, así que se
// tolera hasta 20 % y se avisa desde 12 % para revisar a mano.
for (const f of foods) {
  const kcal = Number(f.kcal);
  const atwater = 4 * Number(f.protein_g) + 4 * Number(f.carbs_g) + 9 * Number(f.fat_g);
  // En alimentos de pocas calorías (frutas, verduras) la fibra y los ácidos
  // orgánicos pesan mucho en proporción: ahí basta con que difiera < 20 kcal.
  const gap = kcal >= 60 ? Math.abs(atwater - kcal) / kcal : Math.abs(atwater - kcal) > 20 ? 1 : 0;
  if (gap > 0.2) throw new Error(`${f.name_es}: ${kcal} kcal no cuadra con sus macros (${atwater.toFixed(0)} kcal)`);
  if (gap > 0.12) console.warn(`  revisar: ${f.name_es} ${kcal} kcal vs ${atwater.toFixed(0)} kcal por macros`);
}
const names = new Set();
for (const f of foods) {
  if (names.has(f.name_es)) throw new Error(`alimento repetido: ${f.name_es}`);
  names.add(f.name_es);
}

const exercises = rows(
  'exercises.csv',
  ['code', 'name_es', 'muscle_group', 'equipment', 'level', 'instructions', 'common_mistakes'],
  { joinRest: true },
);

const sql = `-- =====================================================================
-- DISCIPLINA AI · Migración 0003 · Catálogo global
-- GENERADO por supabase/seed/build.mjs a partir de los CSV. No editar a mano.
-- Alimentos: USDA FoodData Central, SR Legacy (valores por 100 g).
-- Ejercicios: descripciones propias del proyecto.
-- =====================================================================

create unique index if not exists foods_global_ref_key on public.foods (source, source_ref) where owner_id is null;

insert into public.foods (name_es, source, source_ref, kcal_100g, protein_g, carbs_g, fat_g, fiber_g, portion_g, portion_label) values
${foods
  .map(
    (f) =>
      `  (${q(f.name_es)}, 'usda', ${q(f.usda_description.slice(0, 120))}, ${num(f.kcal)}, ${num(f.protein_g)}, ${num(f.carbs_g)}, ${num(f.fat_g)}, ${num(f.fiber_g)}, ${num(f.portion_g)}, ${q(f.portion_label)})`,
  )
  .join(',\n')}
on conflict (source, source_ref) where owner_id is null do update set
  name_es = excluded.name_es, kcal_100g = excluded.kcal_100g, protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, fiber_g = excluded.fiber_g,
  portion_g = excluded.portion_g, portion_label = excluded.portion_label;

insert into public.exercises (code, name_es, muscle_group, equipment, level, instructions, common_mistakes) values
${exercises
  .map(
    (e) =>
      `  (${q(e.code)}, ${q(e.name_es)}, ${q(e.muscle_group)}, ${q(e.equipment)}, ${q(e.level)}, ${q(e.instructions)}, ${q(e.common_mistakes)})`,
  )
  .join(',\n')}
on conflict (code) do update set
  name_es = excluded.name_es, muscle_group = excluded.muscle_group, equipment = excluded.equipment,
  level = excluded.level, instructions = excluded.instructions, common_mistakes = excluded.common_mistakes;
`;

writeFileSync(out, sql);
console.log(`✔ ${foods.length} alimentos y ${exercises.length} ejercicios → ${out}`);
