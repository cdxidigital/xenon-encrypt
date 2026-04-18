import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Lock,
  Plus,
  Shield,
  ChevronDown,
  Ghost,
  Flame,
  Archive,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { api } from '../../src/api';
import { decrypt, sessionKey } from '../../src/crypto';
import { MONO } from '../../src/theme';
import Avatar from '../../src/components/Avatar';

export default function ChatListScreen() {
  const router = useRouter();
  const {
    colors,
    currentIdentity,
    currentXid,
    ghostMode,
    decoyMode,
    vaultUnlocked,
  } = useApp();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentXid) return;
    try {
      const data = await api.listChats(currentXid, vaultUnlocked);
      // decoy mode: hide vault and show only non-vault
      const filtered = decoyMode ? data.filter((c: any) => !c.vault) : data;
      setChats(filtered);
    } catch (e) {
      console.log('load chats', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentXid, vaultUnlocked, decoyMode]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      const iv = setInterval(load, 4000);
      return () => clearInterval(iv);
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const peerName = (chat: any) => {
    if (chat.name) return chat.name;
    if (chat.type === 'direct') {
      const other = chat.participant_xids.find((x: string) => x !== currentXid);
      return other || 'Unknown';
    }
    return chat.participant_xids.length + ' members';
  };

  const previewText = (chat: any) => {
    if (!chat.last_message_preview) return 'No messages yet · handshake complete';
    if (
      chat.last_message_preview.startsWith('[encrypted') ||
      chat.last_message_preview.startsWith('[file')
    ) {
      return chat.last_message_preview;
    }
    const key = sessionKey(chat.id, chat.participant_xids);
    const dec = decrypt(chat.last_message_preview, key);
    return dec.length > 60 ? dec.slice(0, 60) + '…' : dec;
  };

  const relTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Identity switcher header */}
      <TouchableOpacity
        testID="identity-switcher-btn"
        onPress={() => router.push('/identities')}
        activeOpacity={0.7}
        style={[
          styles.idBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Avatar
          label={currentIdentity?.name || '?'}
          seed={currentIdentity?.avatar_seed}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.idName, { color: colors.text_primary }]}>
              {currentIdentity?.name || 'No identity'}
            </Text>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: colors.secure_accent,
              }}
            />
            {currentIdentity?.disposable ? (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: colors.danger + '66',
                }}
              >
                <Text
                  style={{
                    color: colors.danger,
                    fontSize: 9,
                    fontWeight: '800',
                    letterSpacing: 1,
                  }}
                >
                  DISPOSABLE
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[styles.idXid, { color: colors.text_secondary, fontFamily: MONO }]}
            numberOfLines={1}
          >
            {currentIdentity?.xid}
          </Text>
        </View>
        <ChevronDown color={colors.text_muted} size={18} />
      </TouchableOpacity>

      {/* Title + status row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text_primary }]}>Messages</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ghostMode && (
            <View
              style={[styles.pill, { borderColor: colors.text_muted + '66' }]}
              testID="ghost-active-pill"
            >
              <Ghost color={colors.text_secondary} size={11} />
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1,
                }}
              >
                GHOST
              </Text>
            </View>
          )}
          {decoyMode && (
            <View
              style={[styles.pill, { borderColor: colors.danger + '66' }]}
              testID="decoy-active-pill"
            >
              <EyeOff color={colors.danger} size={11} />
              <Text
                style={{
                  color: colors.danger,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1,
                }}
              >
                DECOY
              </Text>
            </View>
          )}
          {vaultUnlocked && (
            <View
              style={[styles.pill, { borderColor: colors.secure_accent + '66' }]}
              testID="vault-active-pill"
            >
              <Eye color={colors.secure_accent} size={11} />
              <Text
                style={{
                  color: colors.secure_accent,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1,
                }}
              >
                VAULT
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary_accent} />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <Shield color={colors.secure_accent} size={48} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: colors.text_primary }]}>No chats yet</Text>
          <Text style={[styles.emptyText, { color: colors.text_secondary }]}>
            Tap the + button to start an encrypted conversation.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="chat-list"
          data={chats}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary_accent}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border + '66', marginLeft: 76 }} />
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`chat-item-${item.id}`}
              onPress={() => router.push(`/chat/${item.id}`)}
              activeOpacity={0.6}
              style={[styles.row, { backgroundColor: colors.background }]}
            >
              <Avatar label={peerName(item)} seed={item.id} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                    }}
                  >
                    <Text
                      style={[styles.peerName, { color: colors.text_primary }]}
                      numberOfLines={1}
                    >
                      {peerName(item)}
                    </Text>
                    <Lock color={colors.secure_accent} size={11} />
                    {item.burn_seconds ? (
                      <Flame color={colors.danger} size={11} />
                    ) : null}
                    {item.vault ? (
                      <Archive color={colors.primary_accent} size={11} />
                    ) : null}
                  </View>
                  <Text style={[styles.time, { color: colors.text_muted, fontFamily: MONO }]}>
                    {relTime(item.last_message_at || item.created_at)}
                  </Text>
                </View>
                <Text
                  style={[styles.preview, { color: colors.text_secondary }]}
                  numberOfLines={1}
                >
                  {previewText(item)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        testID="new-chat-fab"
        onPress={() => router.push('/new-chat')}
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary_accent,
            shadowColor: colors.primary_accent,
          },
        ]}
        activeOpacity={0.85}
      >
        <Plus color={colors.background} size={26} strokeWidth={3} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  idBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  idName: { fontSize: 15, fontWeight: '700' },
  idXid: { fontSize: 11, letterSpacing: 1, marginTop: 2 },
  titleRow: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  empty: { paddingHorizontal: 40, paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  peerName: { fontSize: 15, fontWeight: '700' },
  time: { fontSize: 10, letterSpacing: 0.5 },
  preview: { fontSize: 13, marginTop: 3 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
