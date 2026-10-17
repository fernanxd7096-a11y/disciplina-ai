import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip, Notice, Text } from '@/components/ui';
import { useTasks } from '@/features/tasks/api';
import { aiErrorMessage, providerLabel } from '@/lib/ai';
import { useIsOnline } from '@/lib/network';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import { useApplyProposal, useConversations, useDeleteConversation, useMessages, useProposals, useRejectProposal, useSendMessage } from './api';
import { CONTEXT_LABELS, describeProposal, SAMPLE_PROMPTS } from './logic';
import type { Proposal } from './types';

export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const conversations = useConversations();
  const [convId, setConvId] = useState<string | null>(null);
  const messages = useMessages(convId);
  const msgs = useMemo(() => messages.data ?? [], [messages.data]);
  const proposals = useProposals(convId, msgs.filter((m) => m.role === 'assistant').map((m) => m.id));
  const send = useSendMessage();
  const remove = useDeleteConversation();
  const tasks = useTasks();
  const [text, setText] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ provider: string; context: string[] } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const titles = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t.title])), [tasks.data]);

  async function submit(message: string) {
    const m = message.trim();
    if (!m || send.isPending) return;
    setText('');
    setPendingText(m);
    try {
      const r = await send.mutateAsync({ conversation_id: convId, message: m });
      setConvId(r.conversation_id);
      setMeta({ provider: r.provider, context: r.context_used });
    } catch {
      setText(m); // para reintentar sin volver a escribir
    } finally {
      setPendingText(null);
    }
  }

  function confirmDelete(id: string | 'all') {
    Alert.alert(id === 'all' ? 'Borrar todo el historial' : 'Borrar conversación', 'Se eliminan los mensajes y las propuestas. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await remove.mutateAsync(id).catch(() => Alert.alert('No se pudo borrar', 'Revisa tu conexión.'));
          if (id === 'all' || id === convId) setConvId(null);
        },
      },
    ]);
  }

  const list = conversations.data ?? [];
  const current = list.find((c) => c.id === convId);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="assistant-screen">
      <Stack.Screen
        options={{
          title: current?.title ?? 'Asistente',
          headerRight: () => (convId ? <Button label="Nueva" variant="ghost" icon="add" onPress={() => setConvId(null)} testID="new-chat" /> : null),
        }}
      />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {!convId ? (
          <>
            <Card>
              <Text variant="heading">¿En qué te ayudo?</Text>
              <Text variant="caption" color="textSecondary">
                Respondo con tus datos registrados. Si propongo crear o cambiar algo, verás qué haré y tú decides. Puedes elegir qué datos uso en Ajustes → Privacidad.
              </Text>
            </Card>
            <View style={styles.wrap}>
              {SAMPLE_PROMPTS.map((p) => (
                <Chip key={p} label={p} selected={false} onPress={() => submit(p)} />
              ))}
            </View>
            {list.length ? (
              <>
                <View style={styles.between}>
                  <Text variant="label" color="textSecondary">
                    CONVERSACIONES
                  </Text>
                  <Pressable onPress={() => confirmDelete('all')} accessibilityRole="button" style={styles.hit} testID="delete-all-chats">
                    <Text variant="caption" color="danger">
                      Borrar historial
                    </Text>
                  </Pressable>
                </View>
                {list.map((c) => (
                  <Card key={c.id} onPress={() => setConvId(c.id)} accessibilityLabel={`Abrir conversación ${c.title}`} testID={`conv-${c.id}`}>
                    <View style={styles.between}>
                      <Text variant="body" numberOfLines={1} style={styles.flex}>
                        {c.title}
                      </Text>
                      <Pressable onPress={() => confirmDelete(c.id)} accessibilityRole="button" accessibilityLabel={`Borrar ${c.title}`} style={styles.hit}>
                        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.user : styles.bot]} testID={`msg-${m.role}`}>
            <Text variant="body" color={m.role === 'user' ? 'textOnAccent' : 'text'}>
              {m.content}
            </Text>
            {m.role === 'assistant'
              ? (proposals.data ?? [])
                  .filter((p) => p.message_id === m.id)
                  .map((p) => <ProposalCard key={p.id} proposal={p} conversationId={convId!} titles={titles} />)
              : null}
          </View>
        ))}

        {pendingText ? (
          <>
            <View style={[styles.bubble, styles.user]}>
              <Text variant="body" color="textOnAccent">
                {pendingText}
              </Text>
            </View>
            <View style={[styles.bubble, styles.bot]}>
              <Text variant="caption" color="textSecondary">
                Pensando…
              </Text>
            </View>
          </>
        ) : null}

        {send.error ? <Notice tone="error" message={aiErrorMessage(send.error)} testID="chat-error" /> : null}
        {meta && convId ? (
          <View style={styles.wrap}>
            {providerLabel(meta.provider) ? <Badge label={providerLabel(meta.provider)!} tone={meta.provider === 'mock' ? 'warning' : 'neutral'} /> : null}
            <Badge label={meta.context.length ? `Usó: ${meta.context.map((c) => CONTEXT_LABELS[c] ?? c).join(', ')}` : 'Sin datos personales'} />
          </View>
        ) : null}
        <Text variant="caption" color="textMuted">
          El asistente puede equivocarse. No reemplaza a un profesional de salud.
        </Text>
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={online ? 'Escribe tu pregunta…' : 'Sin conexión'}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={online}
          accessibilityLabel="Mensaje para el asistente"
          testID="chat-input"
        />
        <Pressable
          onPress={() => submit(text)}
          disabled={!online || !text.trim() || send.isPending}
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          style={[styles.send, (!online || !text.trim() || send.isPending) && styles.disabled]}
          testID="chat-send">
          <Ionicons name="arrow-up" size={22} color={colors.textOnAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ProposalCard({ proposal, conversationId, titles }: { proposal: Proposal; conversationId: string; titles: Map<string, string> }) {
  const apply = useApplyProposal(conversationId);
  const reject = useRejectProposal(conversationId);
  const d = describeProposal(proposal, titles);
  return (
    <Card style={styles.proposal} testID={`proposal-${proposal.action_type}`}>
      <Text variant="label" color="accent">
        PROPUESTA
      </Text>
      <Text variant="bodyStrong">{d.title}</Text>
      {d.lines.map((l, i) => (
        <Text key={i} variant="caption" color="textSecondary">
          {l}
        </Text>
      ))}
      {proposal.status === 'pending' ? (
        <>
          {apply.error ? <Notice tone="error" message="No se pudo aplicar. Revisa tu conexión." /> : null}
          <View style={styles.row}>
            <Button label="Descartar" variant="ghost" onPress={() => reject.mutate(proposal)} loading={reject.isPending} grow testID="proposal-reject" />
            <Button label="Confirmar" icon="checkmark" onPress={() => apply.mutate(proposal)} loading={apply.isPending} grow testID="proposal-apply" />
          </View>
        </>
      ) : (
        <Badge label={proposal.status === 'applied' ? 'Aplicado' : 'Descartado'} tone={proposal.status === 'applied' ? 'success' : 'neutral'} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  hit: { minHeight: minTouchSize, minWidth: minTouchSize, alignItems: 'center', justifyContent: 'center' },
  bubble: { padding: spacing.md, borderRadius: radius.lg, maxWidth: '92%', gap: spacing.sm },
  user: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  bot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  proposal: { backgroundColor: colors.surfaceRaised },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  input: { flex: 1, minHeight: minTouchSize, maxHeight: 140, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16 },
  send: { width: minTouchSize, height: minTouchSize, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
