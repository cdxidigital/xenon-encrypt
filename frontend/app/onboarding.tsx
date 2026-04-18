import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shield, Lock, Zap, ArrowRight, Ghost } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { api } from '../src/api';
import { MONO } from '../src/theme';

export default function Onboarding() {
  const router = useRouter();
  const { colors, setCurrentXid, refreshIdentities } = useApp();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const createIdentity = async (disposable: boolean) => {
    const n = name.trim();
    if (!n) return Alert.alert('Name required', 'Enter a display name to generate your XID.');
    setLoading(true);
    try {
      const id = await api.createIdentity(n, disposable);
      await refreshIdentities();
      await setCurrentXid(id.xid);
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <View
              style={[
                styles.logoBadge,
                { borderColor: colors.secure_accent + '55', backgroundColor: colors.surface },
              ]}
            >
              <Shield color={colors.secure_accent} size={36} strokeWidth={2} />
            </View>
            <Text style={[styles.brand, { color: colors.text_primary }]}>XENON</Text>
            <Text style={[styles.tag, { color: colors.text_secondary }]}>
              Zero-trust messenger · Stateless relay · End-to-end sealed
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.text_secondary }]}>DISPLAY NAME</Text>
            <TextInput
              testID="onboarding-name-input"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Nova"
              placeholderTextColor={colors.text_muted}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  color: colors.text_primary,
                  borderColor: colors.border,
                },
              ]}
              autoCapitalize="words"
              maxLength={40}
            />
            <Text style={[styles.hint, { color: colors.text_muted }]}>
              A random Xenon ID (XEN-XXXX-XXXX) will be generated. No phone, no email.
            </Text>

            <TouchableOpacity
              testID="onboarding-create-btn"
              onPress={() => createIdentity(false)}
              disabled={loading}
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.secure_accent, opacity: loading ? 0.7 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={[styles.primaryBtnText, { color: colors.background }]}>
                    Generate Identity
                  </Text>
                  <ArrowRight color={colors.background} size={18} strokeWidth={3} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="onboarding-disposable-btn"
              onPress={() => createIdentity(true)}
              disabled={loading}
              style={[
                styles.ghostBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Ghost color={colors.text_secondary} size={16} />
              <Text style={[styles.ghostBtnText, { color: colors.text_secondary }]}>
                Disposable identity
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.features}>
            <Feature
              icon={<Lock color={colors.secure_accent} size={14} />}
              color={colors.secure_accent}
              label="X3DH · Double Ratchet"
              text="Forward secrecy, post-compromise security"
            />
            <Feature
              icon={<Zap color={colors.primary_accent} size={14} />}
              color={colors.primary_accent}
              label="Stateless relay mesh"
              text="No plaintext ever stored on servers"
            />
          </View>

          <Text
            testID="onboarding-xid-hint"
            style={[styles.footer, { color: colors.text_muted, fontFamily: MONO }]}
          >
            XEN-████-████
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Feature({
  icon,
  label,
  text,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  color: string;
}) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: color + '40',
          backgroundColor: color + '10',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 2,
            fontFamily: MONO,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text style={{ color: colors.text_secondary, fontSize: 13, marginTop: 2 }}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { alignItems: 'center', paddingTop: 48, paddingBottom: 24, paddingHorizontal: 24 },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brand: { fontSize: 36, fontWeight: '900', letterSpacing: 8 },
  tag: { fontSize: 12, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 },
  form: { paddingHorizontal: 24, marginTop: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8, fontFamily: MONO },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
  },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  primaryBtn: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  ghostBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600' },
  features: { paddingHorizontal: 24, marginTop: 28, gap: 6 },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
    marginBottom: 20,
    letterSpacing: 3,
  },
});
