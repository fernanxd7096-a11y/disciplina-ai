import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';

export default function AssistantRoute() {
  return (
    <FeaturePlaceholder
      testID="assistant-screen"
      showHeader={false}
      feature="assistant"
      title="Asistente"
      icon="sparkles-outline"
      emptyTitle="El asistente aún no está conectado"
      emptyDescription="Responderá con tus propios datos y siempre te pedirá confirmación antes de crear, cambiar o borrar algo."
      includes={[
        '“¿Qué tengo pendiente hoy?” y “¿Cómo voy con mis objetivos?”',
        'Reorganizar tareas atrasadas con tu aprobación',
        'Explicar ejercicios y estimar comidas',
        'Historial de chat que puedes borrar',
      ]}
    />
  );
}
