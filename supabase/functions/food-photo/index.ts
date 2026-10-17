// POST { photo_path } → identifica alimentos y estima porciones; macros desde la base nutricional.
import { dailyLimit, getProvider } from '../_shared/ai/provider.ts';
import { consumeQuota, serveUser } from '../_shared/serve.ts';
import { FoodRow, handleFoodPhoto } from './handler.ts';

export default serveUser((body, { supabase, userId }) =>
  handleFoodPhoto(
    body,
    userId,
    {
      consumeQuota: () => consumeQuota(supabase, 'vision', dailyLimit(Deno.env, 'vision')),
      keepPhotos: async () => {
        const { data } = await supabase.from('privacy_settings').select('keep_food_photos').maybeSingle();
        return data?.keep_food_photos === true;
      },
      downloadPhoto: async (path) => {
        const { data, error } = await supabase.storage.from('food-photos').download(path);
        if (error || !data) throw new Error(`No se encontró la foto: ${error?.message ?? ''}`);
        return new Uint8Array(await data.arrayBuffer());
      },
      deletePhoto: async (path) => {
        const { error } = await supabase.storage.from('food-photos').remove([path]);
        if (error) throw error;
      },
      searchFoods: async (q) => {
        const { data, error } = await supabase.rpc('search_foods', { q, max_results: 3 });
        if (error) throw new Error(`search_foods: ${error.message}`);
        return (data ?? []) as FoodRow[];
      },
      saveAnalysis: async (row) => {
        const { data, error } = await supabase.from('food_analyses').insert(row).select('id').single();
        if (error) throw new Error(`food_analyses: ${error.message}`);
        return data.id as string;
      },
    },
    getProvider(Deno.env),
  ),
);
