import { useLocalSearchParams } from 'expo-router';

import { MealScreen } from '@/features/nutrition/MealScreen';

export default function MealRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MealScreen id={id} />;
}
