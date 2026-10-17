import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { DEFAULT_TIME_ZONE } from '@/lib/dates';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type Profile = {
  user_id: string;
  display_name: string | null;
  timezone: string;
  locale: string;
  units: 'metric';
  /** Datos corporales opcionales (para estimar el gasto energético). */
  birth_date: string | null;
  sex: Sex | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
};

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'timezone' | 'birth_date' | 'sex' | 'height_cm' | 'activity_level'>>;

const PROFILE_COLS = 'user_id, display_name, timezone, locale, units, birth_date, sex, height_cm, activity_level';

function normalize(row: Record<string, unknown>): Profile {
  return {
    ...(row as Profile),
    birth_date: (row.birth_date as string | null) ?? null,
    sex: (row.sex as Sex | null) ?? null,
    height_cm: row.height_cm == null ? null : Number(row.height_cm),
    activity_level: (row.activity_level as ActivityLevel | null) ?? null,
  };
}

export const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: profileKey(user.id),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return normalize(data as Record<string, unknown>);
    },
  });
}

/** Zona horaria del perfil; mientras carga, la por defecto (nunca bloquea la UI). */
export function useUserTimeZone(): string {
  const { data } = useProfile();
  return data?.timezone ?? DEFAULT_TIME_ZONE;
}

export function useUpdateProfile() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const { data, error } = await client
        .from('profiles')
        .update(patch)
        .eq('user_id', user.id)
        .select(PROFILE_COLS)
        .single();
      if (error) throw error;
      return normalize(data as Record<string, unknown>);
    },
    onSuccess: (profile) => qc.setQueryData(profileKey(user.id), profile),
  });
}
