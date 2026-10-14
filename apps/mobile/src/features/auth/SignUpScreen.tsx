import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, Notice, Text, TextField } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { signUpSchema, validate, type FieldErrors } from './validation';

type Values = { displayName: string; email: string; password: string; confirm: string };

export function SignUpScreen() {
  const { signUp } = useAuth();
  const [values, setValues] = useState<Values>({ displayName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Values) => (text: string) => setValues((v) => ({ ...v, [k]: text }));

  async function submit() {
    setServerError(null);
    const { data, errors: e } = validate(signUpSchema, values);
    setErrors(e);
    if (!data) return;
    setLoading(true);
    const result = await signUp(data.email, data.password, data.displayName || undefined);
    setLoading(false);
    if (!result.ok) setServerError(result.message);
    else if (result.needsConfirmation) setConfirmSent(true);
  }

  return (
    <AuthLayout
      testID="sign-up-screen"
      title="Crea tu cuenta"
      subtitle="Tus datos solo los ves tú. Puedes borrarlos cuando quieras."
      footer={
        <Link href="/sign-in" style={{ padding: 8 }}>
          <Text variant="body" color="textSecondary">
            ¿Ya tienes cuenta? <Text color="accent">Inicia sesión</Text>
          </Text>
        </Link>
      }>
      {confirmSent ? (
        <Notice
          tone="success"
          testID="sign-up-confirm"
          message={`Te enviamos un enlace a ${values.email.trim()}. Ábrelo para activar tu cuenta y luego inicia sesión.`}
        />
      ) : (
        <>
          {serverError ? <Notice tone="error" message={serverError} testID="sign-up-error" /> : null}
          <TextField
            label="Nombre (opcional)"
            value={values.displayName}
            onChangeText={set('displayName')}
            error={errors.displayName}
            autoComplete="name"
            textContentType="name"
          />
          <TextField
            label="Correo"
            value={values.email}
            onChangeText={set('email')}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            label="Contraseña"
            value={values.password}
            onChangeText={set('password')}
            error={errors.password}
            hint="Mínimo 8 caracteres, con letras y números."
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Repite la contraseña"
            value={values.confirm}
            onChangeText={set('confirm')}
            error={errors.confirm}
            secureTextEntry
            autoComplete="new-password"
          />
          <Button label="Crear cuenta" onPress={submit} loading={loading} fullWidth testID="sign-up-submit" />
        </>
      )}
    </AuthLayout>
  );
}
