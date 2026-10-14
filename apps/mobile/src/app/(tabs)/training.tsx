import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';

export default function TrainingRoute() {
  return (
    <FeaturePlaceholder
      testID="training-screen"
      feature="training"
      title="Entrenamiento"
      icon="barbell-outline"
      emptyTitle="Sin rutina todavía"
      emptyDescription="Primero completarás tu perfil físico (objetivo, experiencia, días y equipamiento) y después tendrás tu rutina."
      includes={[
        'Rutinas con series, repeticiones, descanso y peso sugerido',
        'Técnica paso a paso, errores frecuentes y alternativas',
        'Registro de series y pesos con evolución',
        'Calentamiento, vuelta a la calma y días de descanso',
      ]}
    />
  );
}
