import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';

export default function HabitsRoute() {
  return (
    <FeaturePlaceholder
      testID="habits-screen"
      feature="habits"
      title="Hábitos"
      icon="flame-outline"
      emptyTitle="Aún no tienes hábitos"
      emptyDescription="Crearás hábitos como estudiar, leer, entrenar, dormir o beber agua, y marcarás cada día cuáles cumpliste."
      includes={[
        'Frecuencia diaria o semanal y días concretos',
        'Rachas e historial de cumplimiento',
        'Días de descanso que no rompen la racha',
        'Recordatorios configurables',
        'Pausar, editar o eliminar sin perder el historial',
      ]}
    />
  );
}
