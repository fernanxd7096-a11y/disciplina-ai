import { useLocalSearchParams } from 'expo-router';

import { AddMealScreen } from '@/features/nutrition/AddMealScreen';
import type { MealType } from '@/features/nutrition/types';

const TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function AddMealRoute() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <AddMealScreen initialType={type && TYPES.includes(type) ? (type as MealType) : undefined} />;
}
