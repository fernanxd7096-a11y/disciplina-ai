import { useState } from 'react';

import { Card, EmptyState, Screen, ScreenHeader, SegmentedControl } from '@/components/ui';
import { phaseNotice } from '@/lib/roadmap';

type View = 'tasks' | 'notes' | 'calendar';

const content: Record<View, { icon: 'checkbox-outline' | 'document-text-outline' | 'calendar-outline'; title: string; description: string }> = {
  tasks: {
    icon: 'checkbox-outline',
    title: 'Sin tareas',
    description: `Tareas con prioridad, fecha límite, etiquetas y vista de atrasadas. ${phaseNotice('tasks')}`,
  },
  notes: {
    icon: 'document-text-outline',
    title: 'Sin notas',
    description: `Notas con búsqueda, categorías, etiquetas y guardado automático. ${phaseNotice('notes')}`,
  },
  calendar: {
    icon: 'calendar-outline',
    title: 'Calendario vacío',
    description: `Vistas diaria, semanal y mensual con recordatorios 24 h, 1 h o 15 min antes. ${phaseNotice('calendar')}`,
  },
};

export function PlannerScreen() {
  const [view, setView] = useState<View>('tasks');
  const c = content[view];
  return (
    <Screen testID="planner-screen">
      <ScreenHeader title="Agenda" />
      <SegmentedControl
        accessibilityLabel="Sección de la agenda"
        value={view}
        onChange={setView}
        options={[
          { value: 'tasks', label: 'Tareas' },
          { value: 'notes', label: 'Notas' },
          { value: 'calendar', label: 'Calendario' },
        ]}
      />
      <Card>
        <EmptyState icon={c.icon} title={c.title} description={c.description} testID={`planner-empty-${view}`} />
      </Card>
    </Screen>
  );
}
