import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { DEFAULT_TIME_ZONE } from '@/lib/dates';

export type Profile = {
  user_id: string;
  display_name: string | null;
  timezone: string;
  locale: string;
  units: 'metric';
};

export const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: profileKey(user.id),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await client
        .from('profiles')
        .select('user_id, display_name, timezone, locale, units')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data as Profile;
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
    mutationFn: async (patch: Partial<Pick<Profile, 'display_name' | 'timezone'>>) => {
      const { data, error } = await client
        .from('profiles')
        .update(patch)
        .eq('user_id', user.id)
        .select('user_id, display_name, timezone, locale, units')
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (profile) => qc.setQueryData(profileKey(user.id), profile),
  });
}
