import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Check, Trash2, Ghost } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { api } from '../src/api';
import { MONO } from '../src/theme';
import Avatar from '../src/components/Avatar';

export default function Identities() {
  const router = useRouter();
  const {
    colors,
    currentXid,
    setCurrentXid,
    identities,
    refreshIdentities,
  } = useApp();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Only show identities saved (all for demo, but mark current)
  const list = identities;

  const create = async (disposable: boolean) => {
    const n = newName.trim();
    if (!n) return Alert.alert('Name required');
    setCreating(true);
    try {
      const id = await api.createIdentity(n, disposable);
      await refreshIdentities();
      setNewName('');
      await setCurrentXid(id.xid);
      Alert.alert('Identity created', `${id.xid}`, [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const switchTo = async (xid: string) => {
    await setCurrentXid(xid);
    router.replace('/(tabs)');
  };

  const remove = (xid: string) => {
    if (xid === currentXid) {
      return Alert.alert('Cannot delete current identity', 'Switch first, then delete.');
    }
    Alert.alert('Delete identity?', `${xid} will be wiped from the relay.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteIdentity(xid);
          await refreshIdentities();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="identities-close" onPress={() => router.back()}>
            <X color={colors.text_primary} size={24} />
          </TouchableOpacity>
          <Text style={{ color: colors.text_primary, fontWeight: '800', fontSize: 18 }}>
            Identity Manager
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={list}
          keyExtractor={(item) => item.xid}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }}>
              <Text
                style={{
                  color: colors.text_muted,
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 2,
                  fontFamily: MONO,
                }}
              >
                CREATE NEW IDENTITY
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <TextInput
                  testID="new-identity-name"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Name"
                  placeholderTextColor={colors.text_muted}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text_primary,
                    fontSize: 15,
                  }}
                />
                <TouchableOpacity
                  testID="new-identity-create"
                  onPress={() => create(false)}
                  disabled={creating}
                  style={{
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: colors.secure_accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {creating ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Plus color={colors.background} size={22} strokeWidth={3} />
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                testID="new-identity-disposable"
                onPress={() => create(true)}
                disabled={creating}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.danger + '55',
                  backgroundColor: colors.danger + '10',
                }}
              >
                <Ghost color={colors.danger} size={14} />
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>
                  Create disposable identity
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const active = item.xid === currentXid;
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  marginHorizontal: 20,
                  marginBottom: 10,
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? colors.secure_accent + '88' : colors.border,
                  backgroundColor: active ? colors.secure_accent + '10' : colors.surface,
                }}
              >
                <Avatar label={item.name} seed={item.avatar_seed} size={42} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text_primary, fontWeight: '700', fontSize: 15 }}>
                      {item.name}
                    </Text>
                    {item.disposable && (
                      <Ghost color={colors.danger} size={13} />
                    )}
                  </View>
                  <Text
                    style={{
                      color: colors.text_secondary,
                      fontSize: 11,
                      fontFamily: MONO,
                      marginTop: 2,
                    }}
                  >
                    {item.xid}
                  </Text>
                </View>
                {active ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: colors.secure_accent,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Check color={colors.background} size={12} strokeWidth={3} />
                    <Text
                      style={{
                        color: colors.background,
                        fontWeight: '800',
                        fontSize: 10,
                        letterSpacing: 1,
                      }}
                    >
                      ACTIVE
                    </Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      testID={`switch-${item.xid}`}
                      onPress={() => switchTo(item.xid)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.primary_accent,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.primary_accent,
                          fontWeight: '800',
                          fontSize: 11,
                          letterSpacing: 1,
                        }}
                      >
                        SWITCH
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`delete-${item.xid}`}
                      onPress={() => remove(item.xid)}
                      style={{ padding: 6 }}
                    >
                      <Trash2 color={colors.danger} size={16} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text
              style={{
                color: colors.text_secondary,
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              No identities yet.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
});
