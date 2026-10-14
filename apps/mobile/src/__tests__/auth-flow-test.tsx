import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { FakeSupabase } from '@/test/fakeSupabase';
import { setFakeSupabase, signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

describe('flujo de autenticación', () => {
  it('sin configuración de Supabase muestra la pantalla de configuración', async () => {
    setFakeSupabase(null);
    renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('setup-screen')).toBeTruthy();
  });

  it('sin sesión, cualquier ruta privada lleva a iniciar sesión', async () => {
    setFakeSupabase(new FakeSupabase());
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    expect(await screen.findByTestId('sign-in-screen')).toBeTruthy();
    expect(screen.queryByTestId('habits-screen')).toBeNull();
  });

  it('valida el formulario antes de llamar al servidor', async () => {
    const fake = setFakeSupabase(new FakeSupabase())!;
    renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    fireEvent.press(await screen.findByTestId('sign-in-submit'));
    expect(await screen.findByText('Escribe tu correo.')).toBeTruthy();
    expect(fake.calls).toHaveLength(0);
  });

  it('muestra un error claro con credenciales incorrectas', async () => {
    const fake = setFakeSupabase(new FakeSupabase())!;
    fake.users['ana@test.local'] = { id: 'u1', password: 'Secreta123' };
    renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    fireEvent.changeText(await screen.findByLabelText('Correo'), 'ana@test.local');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'equivocada');
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeTruthy();
  });

  it('con credenciales correctas entra al inicio', async () => {
    const fake = setFakeSupabase(new FakeSupabase())!;
    fake.users['ana@test.local'] = { id: 'u1', password: 'Secreta123' };
    const app = renderRouter(APP_DIR, { initialUrl: '/sign-in' });

    fireEvent.changeText(await screen.findByLabelText('Correo'), 'ana@test.local');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Secreta123');
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(await screen.findByTestId('dashboard-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
  });

  it('al registrarse pide confirmar el correo', async () => {
    setFakeSupabase(new FakeSupabase());
    renderRouter(APP_DIR, { initialUrl: '/sign-up' });

    fireEvent.changeText(await screen.findByLabelText('Correo'), 'nuevo@test.local');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Secreta123');
    fireEvent.changeText(screen.getByLabelText('Repite la contraseña'), 'Secreta123');
    fireEvent.press(screen.getByTestId('sign-up-submit'));

    expect(await screen.findByTestId('sign-up-confirm')).toBeTruthy();
  });

  it('recuperar contraseña confirma el envío sin revelar si la cuenta existe', async () => {
    setFakeSupabase(new FakeSupabase());
    renderRouter(APP_DIR, { initialUrl: '/forgot-password' });
    fireEvent.changeText(await screen.findByLabelText('Correo'), 'quien@test.local');
    fireEvent.press(screen.getByTestId('reset-submit'));
    expect(await screen.findByTestId('reset-sent')).toBeTruthy();
  });

  it('cerrar sesión desde ajustes vuelve a iniciar sesión', async () => {
    signedInFake();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderRouter(APP_DIR, { initialUrl: '/settings' });

    expect(await screen.findByText('ana@test.local')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-out'));
    });
    await waitFor(() => expect(screen.getByTestId('sign-in-screen')).toBeTruthy());
  });
});
