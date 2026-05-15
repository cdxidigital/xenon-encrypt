import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { UserPlus, ShieldCheck, Copy, X, Users as UsersIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../../src/context/AppContext';
import { api } from '../../src/api';
import { MONO } from '../../src/theme';
import Avatar from '../../src/components/Avatar';

export default function ContactsScreen() {
  const router = useRouter();
  const { colors, currentXid, currentIdentity, identities } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [peerXid, setPeerXid] = useState('');
  const [peerName, setPeerName] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentXid) return;
    try {
      const data = await api.listContacts(currentXid);
      setContacts(data);
    } catch (e) {
      console.log('contacts', e);
    }
  }, [currentXid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addContact = async () => {
    const xid = peerXid.trim().toUpperCase();
    if (!xid.match(/^XEN-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
      return Alert.alert('Invalid XID', 'Format: XEN-XXXX-XXXX');
    }
    if (xid === currentXid) return Alert.alert('Oops', "You can't add yourself.");
    setLoading(true);
    try {
      await api.addContact(currentXid!, xid, peerName.trim() || undefined);
      setAddOpen(false);
      setPeerXid('');
      setPeerName('');
      load();
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (peer_xid: string) => {
    if (!currentXid) return;
    try {
      const chat = await api.createChat({
        type: 'direct',
        participant_xids: [currentXid, peer_xid],
        created_by_xid: currentXid,
      });
      router.push(`/chat/${chat.id}`);
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message || e));
    }
  };

  const copyXid = async () => {
    if (currentIdentity?.xid) {
      await Clipboard.setStringAsync(currentIdentity.xid);
      Alert.alert('Copied', `Your XID ${currentIdentity.xid} is in the clipboard.`);
    }
  };

  // suggestions: other identities on this device (not current, not already a contact)
  const contactXids = new Set(contacts.map((c) => c.peer_xid));
  const suggestions = identities.filter(
    (i) => i.xid !== currentXid && !contactXids.has(i.xid),
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text_primary }]}>Contacts</Text>
        <TouchableOpacity
          testID="contacts-add-btn"
          onPress={() => setAddOpen(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary_accent }]}
        >
          <UserPlus color={colors.background} size={18} strokeWidth={3} />
        </TouchableOpacity>
      </View>

      {/* Your XID card */}
      <TouchableOpacity
        testID="my-xid-card"
        onPress={copyXid}
        activeOpacity={0.7}
        style={[
          styles.myCard,
          { backgroundColor: colors.surface, borderColor: colors.secure_accent + '33' },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.secure_accent,
              fontSize: 10,
              fontWeight: '800',
              letterSpacing: 2,
              fontFamily: MONO,
            }}
          >
            MY XENON ID
          </Text>
          <Text
            style={{
              color: colors.text_primary,
              fontSize: 20,
              fontWeight: '800',
              letterSpacing: 2,
              marginTop: 6,
              fontFamily: MONO,
            }}
          >
            {currentIdentity?.xid}
          </Text>
          <Text style={{ color: colors.text_muted, fontSize: 11, marginTop: 4 }}>
            Tap to copy · share to receive messages
          </Text>
        </View>
        <Copy color={colors.text_secondary} size={18} />
      </TouchableOpacity>

      <FlatList
        testID="contacts-list"
        data={contacts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          suggestions.length > 0 ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <Text
                style={{
                  color: colors.text_muted,
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  fontFamily: MONO,
                  marginBottom: 10,
                }}
              >
                DISCOVER
              </Text>
              {suggestions.slice(0, 5).map((s) => (
                <TouchableOpacity
                  testID={`suggestion-${s.xid}`}
                  key={s.xid}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPeerXid(s.xid);
                    setPeerName(s.name);
                    setAddOpen(true);
                  }}
                  style={[
                    styles.suggestionRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Avatar label={s.name} seed={s.avatar_seed} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text_primary, fontWeight: '700' }}>
                      {s.name}
                    </Text>
                    <Text
                      style={{
                        color: colors.text_secondary,
                        fontSize: 11,
                        fontFamily: MONO,
                        marginTop: 2,
                      }}
                    >
                      {s.xid}
                    </Text>
                  </View>
                  <UserPlus color={colors.primary_accent} size={18} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 40, paddingTop: 40, alignItems: 'center' }}>
            <UsersIcon color={colors.text_muted} size={40} strokeWidth={1.5} />
            <Text
              style={{
                color: colors.text_secondary,
                textAlign: 'center',
                marginTop: 14,
                fontSize: 13,
              }}
            >
              No contacts yet. Add a Xenon ID above.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`contact-${item.peer_xid}`}
            onPress={() => openChat(item.peer_xid)}
            activeOpacity={0.7}
            style={[
              styles.contactRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Avatar label={item.peer_name} seed={item.peer_xid} size={44} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.text_primary, fontWeight: '700', fontSize: 15 }}>
                  {item.peer_name}
                </Text>
                {item.verified && <ShieldCheck color={colors.secure_accent} size={14} />}
              </View>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: 11,
                  fontFamily: MONO,
                  marginTop: 3,
                }}
              >
                {item.peer_xid}
              </Text>
            </View>
            <View style={styles.trustBadge}>
              <Text
                style={{
                  color: colors.secure_accent,
                  fontSize: 11,
                  fontWeight: '800',
                  fontFamily: MONO,
                }}
              >
                {item.trust_score}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 120 }}
      />

      {/* Add contact modal */}
      <Modal visible={addOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setAddOpen(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <Text style={{ color: colors.text_primary, fontSize: 20, fontWeight: '800' }}>
                Add Xenon ID
              </Text>
              <TouchableOpacity testID="add-close-btn" onPress={() => setAddOpen(false)}>
                <X color={colors.text_secondary} size={22} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 2,
                fontFamily: MONO,
                marginBottom: 6,
              }}
            >
              XENON ID
            </Text>
            <TextInput
              testID="peer-xid-input"
              value={peerXid}
              onChangeText={(t) => setPeerXid(t.toUpperCase())}
              placeholder="XEN-XXXX-XXXX"
              placeholderTextColor={colors.text_muted}
              autoCapitalize="characters"
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text_primary,
                  borderColor: colors.border,
                  fontFamily: MONO,
                  letterSpacing: 2,
                },
              ]}
            />
            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 2,
                fontFamily: MONO,
                marginBottom: 6,
                marginTop: 14,
              }}
            >
              DISPLAY NAME (OPTIONAL)
            </Text>
            <TextInput
              testID="peer-name-input"
              value={peerName}
              onChangeText={setPeerName}
              placeholder="Local nickname"
              placeholderTextColor={colors.text_muted}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text_primary,
                  borderColor: colors.border,
                },
              ]}
            />
            <TouchableOpacity
              testID="add-contact-submit"
              onPress={addContact}
              disabled={loading}
              style={[
                styles.modalBtn,
                { backgroundColor: colors.secure_accent, opacity: loading ? 0.7 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={{ color: colors.background, fontWeight: '800', fontSize: 15 }}>
                  Add Contact
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  trustBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#39FF1444',
    backgroundColor: '#39FF1410',
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000099' },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  modalInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    fontWeight: '600',
  },
  modalBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
});
