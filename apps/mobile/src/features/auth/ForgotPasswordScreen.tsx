import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, Notice, Text, TextField } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { resetSchema, validate } from './validation';

export function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setServerError(null);
    const { data, errors } = validate(resetSchema, { email });
    setError(errors.email);
    if (!data) return;
    setLoading(true);
    const result = await resetPassword(data.email);
    setLoading(false);
    if (result.ok) setSent(true);
    else setServerError(result.message);
  }

  return (
    <AuthLayout
      testID="forgot-password-screen"
      title="Recuperar acceso"
      subtitle="Te enviaremos un enlace para crear una contraseña nueva."
      footer={
        <Link href="/sign-in" style={{ padding: 8 }}>
          <Text variant="body" color="accent">
            Volver a iniciar sesión
          </Text>
        </Link>
      }>
      {sent ? (
        <Notice
          tone="success"
          testID="reset-sent"
          message="Si existe una cuenta con ese correo, recibirás el enlace en unos minutos. Revisa también la carpeta de spam."
        />
      ) : (
        <>
          {serverError ? <Notice tone="error" message={serverError} /> : null}
          <TextField
            label="Correo"
            value={email}
            onChangeText={setEmail}
            error={error}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Button label="Enviar enlace" onPress={submit} loading={loading} fullWidth testID="reset-submit" />
        </>
      )}
    </AuthLayout>
  );
}
