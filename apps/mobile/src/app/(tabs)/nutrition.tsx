import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';

export default function NutritionRoute() {
  return (
    <FeaturePlaceholder
      testID="nutrition-screen"
      feature="nutrition"
      title="Nutrición"
      icon="nutrition-outline"
      emptyTitle="Diario vacío"
      emptyDescription="Registrarás comidas a mano o con una foto, y verás calorías y macros aproximados del día."
      includes={[
        'Análisis de fotos con rangos estimados y revisión antes de guardar',
        'Registro manual con base de datos de alimentos (incluye alimentos peruanos)',
        'Objetivo calórico estimado (Mifflin-St Jeor), siempre editable',
        'Seguimiento de peso con gráfica de evolución',
      ]}
    />
  );
}
