import { Card, Screen, ScreenHeader, Text } from '@/components/ui';

/**
 * Se muestra solo si la app se compiló sin la configuración de Supabase.
 * Evita que la app se cierre o finja funcionar sin backend.
 */
export default function SetupRoute() {
  return (
    <Screen testID="setup-screen" edges={['top', 'bottom']}>
      <ScreenHeader title="Falta configuración" />
      <Card>
        <Text variant="body" color="textSecondary">
          Esta versión de la app no tiene los datos de conexión con Supabase, así que no puede guardar
          información.
        </Text>
        <Text variant="body" color="textSecondary">
          Crea el archivo apps/mobile/.env a partir de .env.example con EXPO_PUBLIC_SUPABASE_URL y
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, y vuelve a iniciar el servidor de desarrollo.
        </Text>
      </Card>
    </Screen>
  );
}
