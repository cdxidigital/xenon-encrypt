import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, X, KeyRound } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { MONO } from '../src/theme';

export default function VaultUnlock() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { colors, vaultPin, setVaultUnlocked } = useApp();
  const [pin, setPin] = useState('');

  const submit = () => {
    if (!vaultPin) {
      // no pin set, allow through (with warning)
      setVaultUnlocked(true);
      return chatId ? router.replace(`/chat/${chatId}`) : router.back();
    }
    if (pin === vaultPin) {
      setVaultUnlocked(true);
      return chatId ? router.replace(`/chat/${chatId}`) : router.back();
    }
    Alert.alert('Wrong PIN', 'Try again.');
    setPin('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity testID="vault-cancel" onPress={() => router.back()}>
          <X color={colors.text_primary} size={24} />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: colors.surface, borderColor: colors.secure_accent + '55' },
          ]}
        >
          <Lock color={colors.secure_accent} size={36} />
        </View>
        <Text style={{ color: colors.text_primary, fontSize: 22, fontWeight: '900' }}>
          Vault Locked
        </Text>
        <Text
          style={{
            color: colors.text_secondary,
            fontSize: 13,
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 20,
            lineHeight: 19,
          }}
        >
          {vaultPin
            ? 'Enter your vault PIN to unlock this conversation.'
            : 'No vault PIN configured. Confirm to unlock this session.'}
        </Text>

        {vaultPin ? (
          <TextInput
            testID="vault-pin-entry"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="••••"
            placeholderTextColor={colors.text_muted}
            style={{
              marginTop: 24,
              backgroundColor: colors.surface,
              color: colors.text_primary,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 14,
              padding: 16,
              fontFamily: MONO,
              letterSpacing: 10,
              textAlign: 'center',
              fontSize: 22,
              width: 220,
            }}
          />
        ) : null}

        <TouchableOpacity
          testID="vault-unlock-btn"
          onPress={submit}
          style={{
            marginTop: 24,
            backgroundColor: colors.secure_accent,
            paddingHorizontal: 36,
            paddingVertical: 14,
            borderRadius: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <KeyRound color={colors.background} size={16} />
          <Text style={{ color: colors.background, fontWeight: '800', fontSize: 15 }}>
            Unlock
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, flexDirection: 'row' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconBox: {
    width: 90,
    height: 90,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
});
