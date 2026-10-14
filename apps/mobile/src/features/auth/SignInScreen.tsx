import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { Button, Notice, Text, TextField } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { signInSchema, validate, type FieldErrors } from './validation';

type Values = { email: string; password: string };

export function SignInScreen() {
  const { signIn } = useAuth();
  const [values, setValues] = useState<Values>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setServerError(null);
    const { data, errors: e } = validate(signInSchema, values);
    setErrors(e);
    if (!data) return;
    setLoading(true);
    const result = await signIn(data.email, data.password);
    setLoading(false);
    // Si sale bien, el cambio de sesión lleva al inicio automáticamente.
    if (!result.ok) setServerError(result.message);
  }

  return (
    <AuthLayout
      testID="sign-in-screen"
      title="Bienvenido"
      subtitle="Inicia sesión para ver tu día, tus hábitos y tu agenda."
      footer={
        <>
          <Link href="/forgot-password" style={{ padding: 8 }}>
            <Text variant="body" color="accent">
              Olvidé mi contraseña
            </Text>
          </Link>
          <Link href="/sign-up" style={{ padding: 8 }}>
            <Text variant="body" color="textSecondary">
              ¿No tienes cuenta? <Text color="accent">Crear cuenta</Text>
            </Text>
          </Link>
        </>
      }>
      {serverError ? <Notice tone="error" message={serverError} testID="sign-in-error" /> : null}
      <TextField
        label="Correo"
        value={values.email}
        onChangeText={(email) => setValues((v) => ({ ...v, email }))}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Contraseña"
        value={values.password}
        onChangeText={(password) => setValues((v) => ({ ...v, password }))}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Iniciar sesión" onPress={submit} loading={loading} fullWidth testID="sign-in-submit" />
    </AuthLayout>
  );
}
