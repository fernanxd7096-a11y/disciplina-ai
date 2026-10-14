import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { IconButton, Notice, Screen, Text } from '@/components/ui';
import { useIsOnline } from '@/lib/network';
import { colors, spacing, typography } from '@/theme';
import { useSaveNote } from './api';
import { isEmptyNote, type Note } from './logic';

const AUTOSAVE_MS = 700;

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/planner');
}

function confirmDelete(): Promise<boolean> {
  const msg = 'La nota se eliminará.';
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Eliminar nota', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

const stateLabel: Record<SaveState, string> = {
  idle: '',
  pending: 'Cambios sin guardar…',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se pudo guardar',
};

/**
 * Editor con guardado automático: guarda 0,7 s después de dejar de escribir
 * y al salir. Una nota nueva no se crea en la base hasta que tiene contenido,
 * y si se vacía y se sale, se elimina.
 */
export function NoteEditorScreen({ note }: { note?: Note }) {
  const save = useSaveNote();
  const online = useIsOnline();
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [archived, setArchived] = useState(Boolean(note?.archived_at));
  const [state, setState] = useState<SaveState>('idle');

  const idRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef({ title, body });
  const savedSnapshot = useRef({ title: note?.title ?? '', body: note?.body ?? '' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save.mutateAsync);
  useEffect(() => {
    saveRef.current = save.mutateAsync;
  }, [save.mutateAsync]);

  const persist = useCallback(async () => {
    const snapshot = { ...latest.current };
    if (snapshot.title === savedSnapshot.current.title && snapshot.body === savedSnapshot.current.body) return;
    if (!idRef.current && isEmptyNote(snapshot)) return;
    // Si la creación está en curso, espera su id para no crear dos notas.
    if (creating.current) await creating.current;
    setState('saving');
    const run = (async () => {
      const saved = await saveRef.current({ id: idRef.current, patch: snapshot });
      idRef.current = saved.id;
      savedSnapshot.current = snapshot;
    })();
    if (!idRef.current) creating.current = run.finally(() => (creating.current = null));
    try {
      await run;
      setState(latest.current.title === snapshot.title && latest.current.body === snapshot.body ? 'saved' : 'pending');
    } catch {
      setState('error');
    }
  }, []);

  const schedule = useCallback(() => {
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
  }, [persist]);

  // Al salir: guarda lo pendiente; si quedó vacía, la elimina.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const { title: t, body: b } = latest.current;
      if (isEmptyNote({ title: t, body: b })) {
        if (idRef.current)
          void saveRef.current({ id: idRef.current, patch: { deleted_at: new Date().toISOString() } }).catch(() => {});
      } else {
        void persist().catch(() => {});
      }
    };
  }, [persist]);

  function onTitle(t: string) {
    setTitle(t);
    latest.current.title = t;
    schedule();
  }
  function onBody(b: string) {
    setBody(b);
    latest.current.body = b;
    schedule();
  }

  async function setFlag(patch: { pinned?: boolean; archived_at?: string | null }) {
    if (!idRef.current) {
      if (isEmptyNote(latest.current)) return;
      await persist();
    }
    if (!idRef.current) return;
    try {
      await save.mutateAsync({ id: idRef.current, patch });
    } catch {
      setState('error');
    }
  }

  async function handleDelete() {
    if (!(await confirmDelete())) return;
    if (timer.current) clearTimeout(timer.current);
    latest.current = { title: '', body: '' }; // evita el guardado al salir
    if (idRef.current) {
      try {
        await save.mutateAsync({ id: idRef.current, patch: { deleted_at: new Date().toISOString() } });
      } catch {
        setState('error');
        return;
      }
    }
    goBack();
  }

  return (
    <Screen testID="note-editor-screen" edges={[]}>
      <Stack.Screen
        options={{
          title: note ? 'Nota' : 'Nueva nota',
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon={pinned ? 'pin' : 'pin-outline'}
                tone={pinned ? 'accent' : 'default'}
                accessibilityLabel={pinned ? 'Desfijar nota' : 'Fijar nota arriba'}
                onPress={() => {
                  setPinned(!pinned);
                  void setFlag({ pinned: !pinned });
                }}
                testID="pin-note"
              />
              <IconButton
                icon={archived ? 'archive' : 'archive-outline'}
                accessibilityLabel={archived ? 'Sacar del archivo' : 'Archivar nota'}
                onPress={() => {
                  setArchived(!archived);
                  void setFlag({ archived_at: archived ? null : new Date().toISOString() });
                }}
                testID="archive-note"
              />
              <IconButton
                icon="trash-outline"
                accessibilityLabel="Eliminar nota"
                onPress={handleDelete}
                testID="delete-note"
              />
            </View>
          ),
        }}
      />

      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text variant="caption" color={state === 'error' ? 'danger' : 'textMuted'} testID="note-save-state">
          {!online && (state === 'pending' || state === 'saving')
            ? 'Sin conexión · se guardará al reconectar'
            : stateLabel[state]}
          {archived ? ' · Archivada' : ''}
        </Text>
      </View>
      {state === 'error' ? (
        <Notice
          tone="error"
          message="Sin conexión con el servidor. Tu texto sigue aquí; se guardará cuando vuelvas a editar."
        />
      ) : null}

      <TextInput
        value={title}
        onChangeText={onTitle}
        placeholder="Título"
        placeholderTextColor={colors.textMuted}
        style={styles.title}
        accessibilityLabel="Título de la nota"
        maxLength={200}
        testID="note-title"
      />
      <TextInput
        value={body}
        onChangeText={onBody}
        placeholder="Escribe aquí…"
        placeholderTextColor={colors.textMuted}
        style={styles.body}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Contenido de la nota"
        maxLength={20000}
        autoFocus={!note}
        testID="note-body"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  status: { minHeight: 18 },
  title: { ...typography.title, color: colors.text, paddingVertical: spacing.xs },
  body: { ...typography.body, color: colors.text, minHeight: 320 },
});
