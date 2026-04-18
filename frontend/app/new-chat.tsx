import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { X, Lock, Search, Users, Radio } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { api } from '../src/api';
import { MONO } from '../src/theme';
import Avatar from '../src/components/Avatar';

export default function NewChat() {
  const router = useRouter();
  const { colors, currentXid } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'direct' | 'group' | 'broadcast'>('direct');
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!currentXid) return;
    const data = await api.listContacts(currentXid);
    setContacts(data);
  }, [currentXid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = contacts.filter((c) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return c.peer_name.toLowerCase().includes(s) || c.peer_xid.toLowerCase().includes(s);
  });

  const toggle = (xid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (mode === 'direct') {
        next.clear();
        next.add(xid);
      } else {
        next.has(xid) ? next.delete(xid) : next.add(xid);
      }
      return next;
    });
  };

  const create = async () => {
    if (selected.size === 0) return Alert.alert('Pick at least one contact');
    if ((mode === 'group' || mode === 'broadcast') && !groupName.trim())
      return Alert.alert('Name required', `Give your ${mode} a name.`);
    setCreating(true);
    try {
      const chat = await api.createChat({
        type: mode,
        name: mode === 'direct' ? undefined : groupName.trim(),
        participant_xids: [currentXid, ...Array.from(selected)],
        created_by_xid: currentXid,
      });
      router.replace(`/chat/${chat.id}`);
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const modes: { key: any; icon: any; label: string }[] = [
    { key: 'direct', icon: Lock, label: 'Direct' },
    { key: 'group', icon: Users, label: 'Group' },
    { key: 'broadcast', icon: Radio, label: 'Broadcast' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="new-chat-close" onPress={() => router.back()}>
            <X color={colors.text_primary} size={24} />
          </TouchableOpacity>
          <Text style={{ color: colors.text_primary, fontWeight: '800', fontSize: 18 }}>
            New Chat
          </Text>
          <TouchableOpacity
            testID="new-chat-create"
            onPress={create}
            disabled={creating || selected.size === 0}
          >
            {creating ? (
              <ActivityIndicator color={colors.primary_accent} />
            ) : (
              <Text
                style={{
                  color: selected.size === 0 ? colors.text_muted : colors.primary_accent,
                  fontWeight: '800',
                  fontSize: 15,
                }}
              >
                CREATE
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Mode switch */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
          {modes.map((m) => {
            const active = mode === m.key;
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={m.key}
                testID={`mode-${m.key}`}
                onPress={() => {
                  setMode(m.key);
                  if (m.key === 'direct') setSelected(new Set());
                }}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: active ? colors.primary_accent + '15' : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary_accent + '77' : colors.border,
                }}
              >
                <Icon
                  color={active ? colors.primary_accent : colors.text_secondary}
                  size={18}
                />
                <Text
                  style={{
                    color: active ? colors.primary_accent : colors.text_secondary,
                    fontSize: 11,
                    fontWeight: '800',
                    letterSpacing: 1,
                  }}
                >
                  {m.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {(mode === 'group' || mode === 'broadcast') && (
          <TextInput
            testID="group-name-input"
            value={groupName}
            onChangeText={setGroupName}
            placeholder={mode === 'group' ? 'Group name…' : 'Broadcast name…'}
            placeholderTextColor={colors.text_muted}
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.text_primary,
              fontSize: 15,
            }}
          />
        )}

        <View
          style={{
            margin: 16,
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Search color={colors.text_muted} size={16} />
          <TextInput
            testID="new-chat-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search contacts or XID"
            placeholderTextColor={colors.text_muted}
            style={{ flex: 1, color: colors.text_primary, fontSize: 14, paddingVertical: 10 }}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text
              style={{
                color: colors.text_secondary,
                textAlign: 'center',
                marginTop: 40,
                fontSize: 13,
              }}
            >
              No contacts yet. Add someone from the Contacts tab.
            </Text>
          }
          renderItem={({ item }) => {
            const active = selected.has(item.peer_xid);
            return (
              <TouchableOpacity
                testID={`select-${item.peer_xid}`}
                onPress={() => toggle(item.peer_xid)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  marginHorizontal: 16,
                  marginBottom: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active ? colors.primary_accent + '77' : colors.border,
                  backgroundColor: active ? colors.primary_accent + '10' : colors.surface,
                }}
              >
                <Avatar label={item.peer_name} seed={item.peer_xid} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text_primary, fontWeight: '700' }}>
                    {item.peer_name}
                  </Text>
                  <Text
                    style={{
                      color: colors.text_secondary,
                      fontSize: 11,
                      fontFamily: MONO,
                      marginTop: 2,
                    }}
                  >
                    {item.peer_xid}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: active ? colors.primary_accent : colors.border,
                    backgroundColor: active ? colors.primary_accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.background,
                      }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
});
