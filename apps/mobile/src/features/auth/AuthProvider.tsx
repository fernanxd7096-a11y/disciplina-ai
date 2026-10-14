import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase as defaultClient } from '@/lib/supabase';
import { authErrorMessage } from './validation';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'unconfigured';

type Result = { ok: true } | { ok: false; message: string };

type AuthValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  client: SupabaseClient | null;
  signIn(email: string, password: string): Promise<Result>;
  /** needsConfirmation = el proyecto exige confirmar el correo antes de entrar. */
  signUp(email: string, password: string, displayName?: string): Promise<(Result & { needsConfirmation?: boolean })>;
  resetPassword(email: string): Promise<Result>;
  signOut(): Promise<Result>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
  /** Inyectable para pruebas. null = Supabase no configurado. */
  client?: SupabaseClient | null;
};

export function AuthProvider({ children, client = defaultClient }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!client) return;
    let mounted = true;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setStatus(data.session ? 'signedIn' : 'signedOut');
      })
      .catch(() => mounted && setStatus('signedOut'));

    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
      // Nunca mostrar datos de una sesión anterior.
      if (!next) queryClient.clear();
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [client, queryClient]);

  const signIn = useCallback<AuthValue['signIn']>(
    async (email, password) => {
      if (!client) return { ok: false, message: 'La app no está conectada a Supabase.' };
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
    },
    [client],
  );

  const signUp = useCallback<AuthValue['signUp']>(
    async (email, password, displayName) => {
      if (!client) return { ok: false, message: 'La app no está conectada a Supabase.' };
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: displayName ? { display_name: displayName.trim() } : {} },
      });
      if (error) return { ok: false, message: authErrorMessage(error) };
      return { ok: true, needsConfirmation: !data.session };
    },
    [client],
  );

  const resetPassword = useCallback<AuthValue['resetPassword']>(
    async (email) => {
      if (!client) return { ok: false, message: 'La app no está conectada a Supabase.' };
      const { error } = await client.auth.resetPasswordForEmail(email.trim());
      return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
    },
    [client],
  );

  const signOut = useCallback<AuthValue['signOut']>(async () => {
    if (!client) return { ok: true };
    const { error } = await client.auth.signOut();
    queryClient.clear();
    return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
  }, [client, queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      client,
      signIn,
      signUp,
      resetPassword,
      signOut,
    }),
    [status, session, client, signIn, signUp, resetPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Cliente garantizado y usuario actual, para pantallas que solo existen con sesión. */
export function useSessionClient(): { client: SupabaseClient; user: User } {
  const { client, user } = useAuth();
  if (!client || !user) throw new Error('useSessionClient requiere una sesión activa');
  return { client, user };
}
