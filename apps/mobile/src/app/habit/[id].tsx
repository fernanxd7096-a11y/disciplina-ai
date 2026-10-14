import { useLocalSearchParams } from 'expo-router';

import { HabitDetailScreen } from '@/features/habits/HabitDetailScreen';

export default function HabitDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HabitDetailScreen id={id} />;
}
