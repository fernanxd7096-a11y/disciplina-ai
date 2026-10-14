import { readPublicEnv } from '@/lib/env';
import { authErrorMessage, signInSchema, signUpSchema, validate } from '../validation';

describe('validación de formularios', () => {
  it('exige correo válido y contraseña al iniciar sesión', () => {
    expect(validate(signInSchema, { email: '', password: '' }).errors).toEqual({
      email: 'Escribe tu correo.',
      password: 'Escribe tu contraseña.',
    });
    expect(validate(signInSchema, { email: 'ana@', password: 'x' }).errors.email).toBe('Ese correo no parece válido.');
    expect(validate(signInSchema, { email: ' ana@test.com ', password: 'x' }).data?.email).toBe('ana@test.com');
  });

  it('exige contraseña segura y que coincidan al registrarse', () => {
    const base = { email: 'ana@test.com', displayName: '' };
    expect(validate(signUpSchema, { ...base, password: 'corta1', confirm: 'corta1' }).errors.password).toMatch(/8 caracteres/);
    expect(validate(signUpSchema, { ...base, password: 'soloLetras', confirm: 'soloLetras' }).errors.password).toMatch(/número/);
    expect(validate(signUpSchema, { ...base, password: 'Secreta123', confirm: 'Otra1234' }).errors.confirm).toBe(
      'Las contraseñas no coinciden.',
    );
    expect(validate(signUpSchema, { ...base, password: 'Secreta123', confirm: 'Secreta123' }).data).toBeTruthy();
  });
});

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'x' }, 'Correo o contraseña incorrectos.'],
    [{ message: 'Email not confirmed' }, 'Confirma tu correo: revisa el enlace que te enviamos.'],
    [{ code: 'user_already_exists', message: '' }, 'Ya existe una cuenta con ese correo.'],
    [{ status: 429, message: '' }, 'Demasiados intentos. Espera unos minutos y vuelve a intentar.'],
    [{ message: 'Network request failed' }, 'Sin conexión con el servidor. Revisa tu internet.'],
    [{ message: 'algo raro' }, 'No se pudo completar la operación. Intenta de nuevo.'],
  ])('%j → %s', (err, expected) => {
    expect(authErrorMessage(err)).toBe(expected);
  });
});

describe('readPublicEnv', () => {
  it('acepta URL de Supabase y clave publicable', () => {
    expect(
      readPublicEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }),
    ).toEqual({ supabaseUrl: 'https://abc123.supabase.co', supabaseKey: 'sb_publishable_x' });
  });

  it('devuelve null si falta algo o la URL no es válida', () => {
    expect(readPublicEnv({})).toBeNull();
    expect(readPublicEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull();
    expect(readPublicEnv({ EXPO_PUBLIC_SUPABASE_URL: 'http://evil.com', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });
});
