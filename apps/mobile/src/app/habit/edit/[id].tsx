import { useLocalSearchParams } from 'expo-router';

import { LoadingState, Screen } from '@/components/ui';
import { useHabits } from '@/features/habits/api';
import { HabitFormScreen } from '@/features/habits/HabitFormScreen';

export default function EditHabitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useHabits();
  const habit = data?.find((h) => h.id === id);
  if (!habit) {
    return <Screen edges={[]}>{isLoading ? <LoadingState /> : null}</Screen>;
  }
  return <HabitFormScreen habit={habit} />;
}
