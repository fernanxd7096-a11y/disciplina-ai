import { useLocalSearchParams } from 'expo-router';

import { ExerciseScreen } from '@/features/training/ExerciseScreen';

export default function ExerciseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseScreen id={id} />;
}
