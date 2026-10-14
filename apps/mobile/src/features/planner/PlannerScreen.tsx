import { router } from 'expo-router';
import { useState } from 'react';

import { Card, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl } from '@/components/ui';
import { NotesView } from '@/features/notes/NotesView';
import { TasksView } from '@/features/tasks/TasksView';
import { phaseNotice } from '@/lib/roadmap';

type View = 'tasks' | 'notes' | 'calendar';

const addAction: Partial<Record<View, { label: string; href: '/task/new' | '/note/new' }>> = {
  tasks: { label: 'Nueva tarea', href: '/task/new' },
  notes: { label: 'Nueva nota', href: '/note/new' },
};

export function PlannerScreen() {
  const [view, setView] = useState<View>('tasks');
  const add = addAction[view];

  return (
    <Screen testID="planner-screen">
      <ScreenHeader
        title="Agenda"
        right={
          add ? (
            <IconButton icon="add" tone="accent" accessibilityLabel={add.label} onPress={() => router.push(add.href)} testID="planner-add" />
          ) : null
        }
      />
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
      {view === 'tasks' ? <TasksView /> : null}
      {view === 'notes' ? <NotesView /> : null}
      {view === 'calendar' ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="Calendario vacío"
            description={`Vistas diaria, semanal y mensual con recordatorios 24 h, 1 h o 15 min antes. ${phaseNotice('calendar')}`}
            testID="planner-empty-calendar"
          />
        </Card>
      ) : null}
    </Screen>
  );
}
