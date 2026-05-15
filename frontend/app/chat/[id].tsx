import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Lock,
  Send,
  Flame,
  Sparkles,
  Fingerprint,
  Shield,
  X,
  ShieldCheck,
  Paperclip,
  Archive,
  Trash2,
  RefreshCcw,
  Zap,
} from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { api } from '../../src/api';
import { decrypt, encrypt, sessionKey } from '../../src/crypto';
import { MONO } from '../../src/theme';
import Avatar from '../../src/components/Avatar';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    colors,
    currentXid,
    ghostMode,
    vaultUnlocked,
    vaultPin,
  } = useApp();

  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<string[]>([]);
  const [burnSeconds, setBurnSeconds] = useState<number | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [tick, setTick] = useState(0);
  const listRef = useRef<FlatList>(null);
  const typingRef = useRef<any>(null);

  const loadChat = useCallback(async () => {
    try {
      const c = await api.getChat(id);
      setChat(c);
      if (c.burn_seconds) setBurnSeconds(c.burn_seconds);
      // vault lock
      if (c.vault && !vaultUnlocked) {
        router.replace({ pathname: '/vault-unlock', params: { chatId: id } });
      }
    } catch (e) {
      console.log('loadChat error', e);
    }
  }, [id, vaultUnlocked, router]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.listMessages(id);
      setMessages(data);
      // mark unread as read
      if (!ghostMode && currentXid) {
        data
          .filter((m: any) => m.sender_xid !== currentXid && !(m.read_by || []).includes(currentXid))
          .forEach((m: any) => api.markRead(m.id, currentXid).catch(() => {}));
      }
    } catch (e) {
      console.log('loadMessages error', e);
    }
  }, [id, currentXid, ghostMode]);

  const loadTyping = useCallback(async () => {
    if (!currentXid) return;
    try {
      const r = await api.getTyping(id, currentXid);
      setTyping(r.typing_xids || []);
    } catch {}
  }, [id, currentXid]);

  useEffect(() => {
    loadChat();
    loadMessages();
    const iv = setInterval(() => {
      loadMessages();
      loadTyping();
    }, 2500);
    const tickIv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(iv);
      clearInterval(tickIv);
    };
  }, [loadChat, loadMessages, loadTyping]);

  useEffect(() => {
    // Load fingerprint
    if (id) {
      api
        .getFingerprint(id)
        .then((r) => setFingerprint(r.fingerprint))
        .catch(() => {});
    }
  }, [id]);

  const peerName = () => {
    if (!chat) return 'Loading…';
    if (chat.name) return chat.name;
    if (chat.type === 'direct') {
      return chat.participant_xids.find((x: string) => x !== currentXid) || 'Unknown';
    }
    return `${chat.participant_xids.length} members`;
  };

  const onChangeText = (v: string) => {
    setText(v);
    if (ghostMode || !currentXid) return;
    // send typing
    api.setTyping(id, currentXid, true).catch(() => {});
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      api.setTyping(id, currentXid, false).catch(() => {});
    }, 2500);
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !chat || !currentXid) return;
    setSending(true);
    const key = sessionKey(id, chat.participant_xids);
    const ct = encrypt(t, key);
    setText('');
    setSuggestions([]);
    try {
      await api.sendMessage({
        chat_id: id,
        sender_xid: currentXid,
        ciphertext: ct,
        content_type: 'text',
        self_destruct_seconds: burnSeconds || undefined,
      });
      loadMessages();
      api.setTyping(id, currentXid, false).catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      Alert.alert('Send failed', String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const requestSmartReplies = async () => {
    if (!chat) return;
    setSuggestionsLoading(true);
    try {
      const key = sessionKey(id, chat.participant_xids);
      const transcript = messages
        .filter((m) => !m.destroyed)
        .slice(-10)
        .map((m) => ({
          sender: m.sender_xid === currentXid ? 'me' : 'them',
          text: decrypt(m.ciphertext, key),
        }));
      const r = await api.smartReply(transcript);
      setSuggestions(r.suggestions || []);
    } catch (e: any) {
      Alert.alert('AI unavailable', String(e?.message || e));
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const requestSummary = async () => {
    if (!chat) return;
    setSummarizing(true);
    setSummary(null);
    try {
      const key = sessionKey(id, chat.participant_xids);
      const transcript = messages
        .filter((m) => !m.destroyed)
        .slice(-40)
        .map((m) => ({
          sender: m.sender_xid === currentXid ? 'me' : 'them',
          text: decrypt(m.ciphertext, key),
        }));
      if (transcript.length === 0) {
        setSummary('No messages to summarize yet.');
        return;
      }
      const r = await api.summarize(transcript);
      setSummary(r.summary);
    } catch (e: any) {
      setSummary('AI summary failed: ' + String(e?.message || e));
    } finally {
      setSummarizing(false);
    }
  };

  const toggleVault = async () => {
    if (!chat) return;
    const newVault = !chat.vault;
    try {
      const updated = await api.updateChat(id, { vault: newVault });
      setChat(updated);
      Alert.alert(
        newVault ? 'Moved to Vault' : 'Removed from Vault',
        newVault
          ? vaultPin
            ? 'This chat now requires your PIN to open.'
            : 'Set a vault PIN in Settings for full protection.'
          : 'This chat is now visible in your normal list.',
      );
    } catch {}
  };

  const deleteChat = () => {
    Alert.alert('Delete chat?', 'All messages will be wiped from the relay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteChat(id);
          router.back();
        },
      },
    ]);
  };

  const key = chat ? sessionKey(id, chat.participant_xids) : '';
  const burnOptions: { label: string; value: number | null }[] = [
    { label: 'Off', value: null },
    { label: '10s', value: 10 },
    { label: '1m', value: 60 },
    { label: '5m', value: 300 },
    { label: '1h', value: 3600 },
  ];

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          testID="chat-back-btn"
          onPress={() => router.back()}
          style={{ padding: 6 }}
        >
          <ArrowLeft color={colors.text_primary} size={22} />
        </TouchableOpacity>
        <Avatar label={peerName()} seed={id} size={38} />
        <TouchableOpacity
          testID="chat-header-info"
          onPress={() => setSecurityOpen(true)}
          style={{ flex: 1 }}
        >
          <Text style={[styles.peerName, { color: colors.text_primary }]} numberOfLines={1}>
            {peerName()}
          </Text>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
          >
            <Lock color={colors.secure_accent} size={10} />
            <Text
              style={{
                color: colors.secure_accent,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1,
                fontFamily: MONO,
              }}
            >
              E2E ENCRYPTED
            </Text>
            {typing.length > 0 && !ghostMode && (
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: 10,
                  fontStyle: 'italic',
                  marginLeft: 4,
                }}
              >
                · typing…
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          testID="chat-security-btn"
          onPress={() => setSecurityOpen(true)}
          style={{ padding: 6 }}
        >
          <Shield color={colors.secure_accent} size={20} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* AI bar */}
        <View
          style={[
            styles.aiBar,
            { backgroundColor: colors.background, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            testID="ai-smart-reply-btn"
            onPress={requestSmartReplies}
            disabled={suggestionsLoading}
            style={[
              styles.aiChip,
              { borderColor: colors.primary_accent + '55', backgroundColor: colors.primary_accent + '10' },
            ]}
          >
            {suggestionsLoading ? (
              <ActivityIndicator color={colors.primary_accent} size="small" />
            ) : (
              <Sparkles color={colors.primary_accent} size={13} />
            )}
            <Text
              style={{ color: colors.primary_accent, fontSize: 12, fontWeight: '700' }}
            >
              Smart reply
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="ai-summarize-btn"
            onPress={requestSummary}
            disabled={summarizing}
            style={[
              styles.aiChip,
              { borderColor: colors.primary_accent + '55', backgroundColor: colors.primary_accent + '10' },
            ]}
          >
            {summarizing ? (
              <ActivityIndicator color={colors.primary_accent} size="small" />
            ) : (
              <Zap color={colors.primary_accent} size={13} />
            )}
            <Text style={{ color: colors.primary_accent, fontSize: 12, fontWeight: '700' }}>
              Summarize
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            testID="chat-burn-cycle-btn"
            onPress={() => {
              const i = burnOptions.findIndex((o) => o.value === burnSeconds);
              const next = burnOptions[(i + 1) % burnOptions.length];
              setBurnSeconds(next.value);
              api.updateChat(id, { burn_seconds: next.value }).catch(() => {});
            }}
            style={[
              styles.aiChip,
              {
                borderColor: burnSeconds ? colors.danger + '80' : colors.border,
                backgroundColor: burnSeconds ? colors.danger + '15' : 'transparent',
              },
            ]}
          >
            <Flame
              color={burnSeconds ? colors.danger : colors.text_secondary}
              size={13}
            />
            <Text
              style={{
                color: burnSeconds ? colors.danger : colors.text_secondary,
                fontSize: 12,
                fontWeight: '700',
                fontFamily: MONO,
              }}
            >
              {burnOptions.find((o) => o.value === burnSeconds)?.label || 'Off'}
            </Text>
          </TouchableOpacity>
        </View>

        {summary && (
          <View
            style={[
              styles.summaryBox,
              { backgroundColor: colors.primary_accent + '12', borderColor: colors.primary_accent + '55' },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Sparkles color={colors.primary_accent} size={13} />
              <Text
                style={{
                  color: colors.primary_accent,
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  fontFamily: MONO,
                }}
              >
                AI SUMMARY
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setSummary(null)}>
                <X color={colors.text_muted} size={14} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.text_primary, fontSize: 13, lineHeight: 19 }}>
              {summary}
            </Text>
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={listRef}
          testID="chat-messages"
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender_xid === currentXid;
            const plaintext = item.destroyed ? null : decrypt(item.ciphertext, key);
            const now = Date.now();
            const created = new Date(item.created_at).getTime();
            const remaining =
              item.self_destruct_seconds && !item.destroyed
                ? Math.max(0, item.self_destruct_seconds - Math.floor((now - created) / 1000))
                : null;
            // reference tick so countdown re-renders
            void tick;
            const read = (item.read_by || []).some((x: string) => x !== currentXid);
            return (
              <View
                style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
                testID={`msg-${item.id}`}
              >
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? {
                          backgroundColor: colors.surface,
                          borderColor: colors.primary_accent + '40',
                          borderTopRightRadius: 4,
                        }
                      : {
                          backgroundColor: colors.surface_elevated,
                          borderColor: colors.border,
                          borderTopLeftRadius: 4,
                        },
                  ]}
                >
                  {item.destroyed ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Flame color={colors.danger} size={12} />
                      <Text
                        style={{
                          color: colors.text_muted,
                          fontSize: 13,
                          fontStyle: 'italic',
                        }}
                      >
                        Message self-destructed
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontSize: 15,
                        lineHeight: 21,
                      }}
                    >
                      {plaintext}
                    </Text>
                  )}
                  <View style={styles.bubbleMeta}>
                    {remaining !== null && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Flame color={colors.danger} size={9} />
                        <Text
                          style={{
                            color: colors.danger,
                            fontSize: 10,
                            fontFamily: MONO,
                            fontWeight: '700',
                          }}
                        >
                          {remaining}s
                        </Text>
                      </View>
                    )}
                    <Text
                      style={{
                        color: colors.text_muted,
                        fontSize: 10,
                        fontFamily: MONO,
                      }}
                    >
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {mine && !ghostMode && (
                      <Text
                        style={{
                          color: read ? colors.secure_accent : colors.text_muted,
                          fontSize: 10,
                          fontWeight: '700',
                        }}
                      >
                        {read ? '✓✓' : '✓'}
                      </Text>
                    )}
                    <Lock color={colors.secure_accent} size={9} />
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Lock color={colors.secure_accent} size={32} strokeWidth={1.5} />
              <Text
                style={{
                  color: colors.secure_accent,
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  marginTop: 10,
                  fontFamily: MONO,
                }}
              >
                SESSION ESTABLISHED
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: 12,
                  marginTop: 8,
                  textAlign: 'center',
                  paddingHorizontal: 40,
                  lineHeight: 18,
                }}
              >
                Messages are sealed with a per-chat key. Only your devices can read them.
              </Text>
            </View>
          }
        />

        {/* Smart reply chips */}
        {suggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
            contentContainerStyle={{ padding: 10, gap: 8 }}
          >
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                testID={`smart-reply-${i}`}
                onPress={() => {
                  setText(s);
                  setSuggestions([]);
                }}
                style={[
                  styles.replyChip,
                  {
                    borderColor: colors.primary_accent + '55',
                    backgroundColor: colors.primary_accent + '10',
                  },
                ]}
              >
                <Text
                  style={{ color: colors.primary_accent, fontSize: 13, fontWeight: '600' }}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            testID="chat-attach-btn"
            onPress={() =>
              Alert.alert(
                'Attachments',
                'Image, audio, and file attachments are encrypted end-to-end in the full build. Demo focuses on text.',
              )
            }
            style={{ padding: 6 }}
          >
            <Paperclip color={colors.text_secondary} size={20} />
          </TouchableOpacity>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={onChangeText}
            placeholder="Encrypted message…"
            placeholderTextColor={colors.text_muted}
            multiline
            style={[
              styles.input,
              {
                color: colors.text_primary,
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          />
          <TouchableOpacity
            testID="chat-send-btn"
            onPress={send}
            disabled={!text.trim() || sending}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  text.trim() && !sending ? colors.secure_accent : colors.border,
              },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Send color={colors.background} size={18} strokeWidth={3} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Security panel */}
      <Modal visible={securityOpen} animationType="slide" transparent>
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setSecurityOpen(false)}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 18,
            }}
          >
            <ShieldCheck color={colors.secure_accent} size={22} />
            <Text style={{ color: colors.text_primary, fontSize: 20, fontWeight: '800' }}>
              Session Security
            </Text>
          </View>

          <View
            style={[
              styles.fpBox,
              { borderColor: colors.secure_accent + '50', backgroundColor: colors.background },
            ]}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
            >
              <Fingerprint color={colors.secure_accent} size={14} />
              <Text
                style={{
                  color: colors.secure_accent,
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  fontFamily: MONO,
                }}
              >
                SESSION FINGERPRINT
              </Text>
            </View>
            <Text
              testID="session-fingerprint"
              style={{
                color: colors.text_primary,
                fontFamily: MONO,
                fontSize: 12,
                lineHeight: 22,
                letterSpacing: 2,
              }}
            >
              {fingerprint || '…'}
            </Text>
            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 11,
                marginTop: 10,
              }}
            >
              Verify this matches your peer&apos;s fingerprint (in person or over a trusted channel) to
              confirm no one is in the middle.
            </Text>
          </View>

          <View
            style={{ marginTop: 16, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}
          >
            <MetricChip
              color={colors.secure_accent}
              label="PROTOCOL"
              value="X3DH + DR"
            />
            <MetricChip
              color={colors.primary_accent}
              label="CIPHER"
              value="AES-256"
            />
            <MetricChip
              color={colors.primary_accent}
              label="CURVE"
              value="CURVE25519"
            />
          </View>

          <View
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 2,
                fontFamily: MONO,
              }}
            >
              PARTICIPANTS
            </Text>
            {chat?.participant_xids.map((p: string) => (
              <Text
                key={p}
                style={{
                  color: p === currentXid ? colors.secure_accent : colors.text_primary,
                  fontSize: 13,
                  fontFamily: MONO,
                  marginTop: 6,
                  letterSpacing: 1,
                }}
              >
                {p}
                {p === currentXid ? '  (you)' : ''}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity
              testID="chat-vault-btn"
              onPress={toggleVault}
              style={[styles.sheetBtn, { borderColor: colors.border }]}
            >
              <Archive color={chat?.vault ? colors.primary_accent : colors.text_primary} size={16} />
              <Text
                style={{
                  color: chat?.vault ? colors.primary_accent : colors.text_primary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {chat?.vault ? 'In Vault' : 'Move to Vault'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="chat-delete-btn"
              onPress={deleteChat}
              style={[
                styles.sheetBtn,
                { borderColor: colors.danger + '55', backgroundColor: colors.danger + '10' },
              ]}
            >
              <Trash2 color={colors.danger} size={16} />
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>
                Delete
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="chat-refresh-fp-btn"
              onPress={() =>
                api
                  .getFingerprint(id)
                  .then((r) => setFingerprint(r.fingerprint))
                  .catch(() => {})
              }
              style={[styles.sheetBtn, { borderColor: colors.border }]}
            >
              <RefreshCcw color={colors.text_primary} size={16} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => setSecurityOpen(false)}
            style={{ alignItems: 'center', marginTop: 20, padding: 10 }}
          >
            <Text style={{ color: colors.text_secondary, fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MetricChip({ color, label, value }: any) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: color + '55',
        backgroundColor: color + '10',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
      }}
    >
      <Text
        style={{
          color: color,
          fontSize: 9,
          fontWeight: '800',
          letterSpacing: 1.5,
          fontFamily: MONO,
        }}
      >
        {label}
      </Text>
      <Text
        style={{ color: color, fontSize: 13, fontWeight: '800', fontFamily: MONO, marginTop: 2 }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  peerName: { fontSize: 16, fontWeight: '800' },
  aiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  summaryBox: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 4,
  },
  replyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBackdrop: { flex: 1, backgroundColor: '#000000b3' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#55555555',
    alignSelf: 'center',
    marginBottom: 16,
  },
  fpBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  sheetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
