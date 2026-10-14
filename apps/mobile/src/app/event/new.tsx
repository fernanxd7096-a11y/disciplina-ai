import { useLocalSearchParams } from 'expo-router';

import { EventFormScreen } from '@/features/events/EventFormScreen';

export default function NewEventRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <EventFormScreen initialDay={day} />;
}
