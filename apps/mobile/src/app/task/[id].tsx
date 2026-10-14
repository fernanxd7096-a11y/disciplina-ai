import { useLocalSearchParams } from 'expo-router';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useTasks } from '@/features/tasks/api';
import { TaskFormScreen } from '@/features/tasks/TaskFormScreen';

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useTasks();
  const task = data?.find((t) => t.id === id);
  if (!task) {
    return (
      <Screen edges={[]}>
        {isLoading ? <LoadingState /> : <EmptyState icon="help-circle-outline" title="Esta tarea ya no existe" />}
      </Screen>
    );
  }
  return <TaskFormScreen task={task} />;
}
