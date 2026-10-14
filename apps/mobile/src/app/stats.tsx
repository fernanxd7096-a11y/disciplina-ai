import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';

export default function StatsRoute() {
  return (
    <FeaturePlaceholder
      testID="stats-screen"
      showHeader={false}
      feature="stats"
      title="Estadísticas"
      icon="stats-chart-outline"
      emptyTitle="Todavía no hay datos que graficar"
      emptyDescription="Las gráficas se construirán con tus registros reales a medida que uses la app."
      includes={[
        'Cumplimiento diario, semanal y mensual de hábitos',
        'Tareas completadas y frecuencia de entrenamiento',
        'Evolución del peso e historial nutricional',
        'Etiqueta clara entre dato registrado y estimación de IA',
      ]}
    />
  );
}
