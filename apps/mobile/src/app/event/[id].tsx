import { useLocalSearchParams } from 'expo-router';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useEvents } from '@/features/events/api';
import { EventFormScreen } from '@/features/events/EventFormScreen';

export default function EventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useEvents();
  const event = data?.find((e) => e.id === id);
  if (!event) {
    return (
      <Screen edges={[]}>
        {isLoading ? <LoadingState /> : <EmptyState icon="help-circle-outline" title="Este evento ya no existe" />}
      </Screen>
    );
  }
  return <EventFormScreen event={event} />;
}
