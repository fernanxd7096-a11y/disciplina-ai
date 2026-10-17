import { useLocalSearchParams } from 'expo-router';

import { PlanBuilderScreen } from '@/features/training/PlanBuilderScreen';

export default function PlanNewRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <PlanBuilderScreen mode={mode === 'ai' ? 'ai' : 'basic'} />;
}
