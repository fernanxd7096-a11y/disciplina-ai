import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Notice, SectionHeader, Text, TextField, ToggleRow } from '@/components/ui';
import { useAuth, useSessionClient } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/api';
import { useIsOnline } from '@/lib/network';
import { colors, spacing } from '@/theme';
import { deleteAccount, useExportData, usePrivacy, useUpdatePrivacy } from './data';

export function NameSection() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState<string | null>(null);
  const value = name ?? profile.data?.display_name ?? '';
  const dirty = name !== null && name.trim() !== (profile.data?.display_name ?? '');
  return (
    <View style={styles.block}>
      <TextField label="Nombre" value={value} onChangeText={setName} maxLength={60} placeholder="Cómo te saludo" testID="settings-name" />
      {dirty ? (
        <Button
          label="Guardar nombre"
          variant="secondary"
          loading={update.isPending}
          onPress={() => update.mutate({ display_name: name!.trim() || null }, { onSuccess: () => setName(null) })}
          testID="save-name"
        />
      ) : null}
    </View>
  );
}

export function GoalsSection() {
  return (
    <>
      <SectionHeader title="Perfil y objetivos" />
      <Card>
        <Button label="Perfil de entrenamiento" variant="ghost" icon="barbell-outline" onPress={() => router.push('/training/profile')} testID="settings-training" />
        <Button label="Objetivo nutricional y datos corporales" variant="ghost" icon="nutrition-outline" onPress={() => router.push('/nutrition/goal')} testID="settings-nutrition" />
      </Card>
    </>
  );
}

export function DisciplineSection() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const cfg = profile.data?.discipline_config ?? { habits: true, tasks: true, training: true };
  const set = (k: keyof typeof cfg, v: boolean) => {
    const next = { ...cfg, [k]: v };
    if (!next.habits && !next.tasks && !next.training) {
      Alert.alert('Elige al menos uno', 'El porcentaje de disciplina necesita al menos un componente.');
      return;
    }
    update.mutate({ discipline_config: next });
  };
  return (
    <>
      <SectionHeader title="Porcentaje de disciplina" />
      <Card>
        <Text variant="caption" color="textSecondary">
          Promedio de los últimos 7 días de lo que actives. Los días de descanso no cuentan en contra.
        </Text>
        <ToggleRow label="Hábitos cumplidos" value={cfg.habits} onChange={(v) => set('habits', v)} testID="disc-habits" />
        <ToggleRow label="Tareas a tiempo" value={cfg.tasks} onChange={(v) => set('tasks', v)} testID="disc-tasks" />
        <ToggleRow label="Entrenamientos según tu plan" value={cfg.training} onChange={(v) => set('training', v)} testID="disc-training" />
      </Card>
    </>
  );
}

export function PrivacySection() {
  const privacy = usePrivacy();
  const update = useUpdatePrivacy();
  const p = privacy.data;
  return (
    <>
      <SectionHeader title="Privacidad" />
      <Card testID="privacy-card">
        <Text variant="bodyStrong">Qué datos puede usar el asistente de IA</Text>
        {p ? (
          <>
            <ToggleRow label="Hábitos" value={p.ai_use_habits} onChange={(v) => update.mutate({ ai_use_habits: v })} testID="ai-habits" />
            <ToggleRow label="Tareas y calendario" value={p.ai_use_planner} onChange={(v) => update.mutate({ ai_use_planner: v })} testID="ai-planner" />
            <ToggleRow label="Entrenamiento" value={p.ai_use_training} onChange={(v) => update.mutate({ ai_use_training: v })} testID="ai-training" />
            <ToggleRow label="Nutrición y peso" value={p.ai_use_nutrition} onChange={(v) => update.mutate({ ai_use_nutrition: v })} testID="ai-nutrition" />
            <Text variant="caption" color="textMuted">
              Tus notas nunca se envían a la IA.
            </Text>
            <View style={styles.divider} />
            <ToggleRow
              label="Conservar fotos de comida"
              hint="Si está apagado, cada foto se borra apenas termina el análisis."
              value={p.keep_food_photos}
              onChange={(v) => update.mutate({ keep_food_photos: v })}
              testID="keep-photos"
            />
          </>
        ) : (
          <Text variant="caption" color="textMuted">
            {privacy.isError ? 'No se pudo cargar. Revisa tu conexión.' : 'Cargando…'}
          </Text>
        )}
        {update.isError ? <Notice tone="error" message="No se pudo guardar el cambio." /> : null}
      </Card>
    </>
  );
}

export function DataSection() {
  const online = useIsOnline();
  const { client, user } = useSessionClient();
  const { signOut } = useAuth();
  const exp = useExportData();
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(client, user.id);
      await signOut();
    } catch {
      setError('No se pudo borrar la cuenta. Revisa tu conexión e inténtalo de nuevo.');
      setDeleting(false);
    }
  }

  return (
    <>
      <SectionHeader title="Tus datos" />
      <Card>
        <Text variant="caption" color="textSecondary">
          Descarga todo lo que guardaste (hábitos, tareas, notas, entrenamientos, comidas, conversaciones…) en un archivo JSON.
        </Text>
        <Button label="Exportar mis datos" icon="download-outline" variant="secondary" onPress={() => exp.mutate()} loading={exp.isPending} disabled={!online} testID="export-data" />
        {exp.isSuccess ? <Notice tone="success" message={`Exportación lista: ${exp.data.rows} registros.`} testID="export-done" /> : null}
        {exp.isError ? <Notice tone="error" message="No se pudo exportar. Revisa tu conexión." /> : null}
        <View style={styles.divider} />
        {!showDelete ? (
          <Button label="Borrar mi cuenta" icon="trash-outline" variant="danger" onPress={() => setShowDelete(true)} testID="delete-account" />
        ) : (
          <View style={styles.block}>
            <Text variant="body" color="danger">
              Se borrarán para siempre tu cuenta, todos tus datos y tus fotos. No se puede deshacer.
            </Text>
            <TextField label='Escribe "BORRAR" para confirmar' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" testID="delete-confirm" />
            {error ? <Notice tone="error" message={error} /> : null}
            <View style={styles.row}>
              <Button label="Cancelar" variant="ghost" onPress={() => setShowDelete(false)} grow />
              <Button label="Borrar definitivamente" variant="danger" onPress={doDelete} loading={deleting} disabled={confirmText.trim() !== 'BORRAR' || !online} grow testID="delete-account-confirm" />
            </View>
          </View>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
});
