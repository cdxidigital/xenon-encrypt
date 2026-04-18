import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Palette,
  Ghost,
  Flame,
  Archive,
  ShieldAlert,
  EyeOff,
  KeyRound,
  LogOut,
  ChevronRight,
  User,
  Check,
  Trash2,
  Info,
} from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { THEMES, ThemeName, MONO } from '../../src/theme';
import { api } from '../../src/api';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    colors,
    theme,
    setTheme,
    currentXid,
    currentIdentity,
    setCurrentXid,
    refreshIdentities,
    ghostMode,
    setGhostMode,
    decoyMode,
    setDecoyMode,
    vaultPin,
    setVaultPin,
    setVaultUnlocked,
  } = useApp();

  const [themeOpen, setThemeOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const onPanic = () => {
    Alert.alert(
      'Panic Mode',
      'This will WIPE your current identity, all chats, and messages from the relay. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            if (!currentXid) return;
            try {
              await api.panic(currentXid);
              await setCurrentXid(null);
              await refreshIdentities();
              setVaultUnlocked(false);
              router.replace('/onboarding');
            } catch (e: any) {
              Alert.alert('Failed', String(e?.message || e));
            }
          },
        },
      ],
    );
  };

  const onLogout = () => {
    Alert.alert('Switch identity?', 'You will be prompted to select or create a new identity.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch',
        onPress: async () => {
          await setCurrentXid(null);
          setVaultUnlocked(false);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const savePin = () => {
    if (pinInput.length < 4) return Alert.alert('PIN too short', 'Minimum 4 digits.');
    setVaultPin(pinInput);
    setPinInput('');
    setPinOpen(false);
    Alert.alert('Vault PIN set', 'Hidden chats now require this PIN to unlock.');
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={[styles.title, { color: colors.text_primary }]}>Settings</Text>

        {/* Identity card */}
        <TouchableOpacity
          testID="settings-identities"
          onPress={() => router.push('/identities')}
          activeOpacity={0.7}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.primary_accent + '20' }]}>
            <User color={colors.primary_accent} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text_primary }]}>
              Identity Manager
            </Text>
            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 11,
                fontFamily: MONO,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {currentIdentity?.xid} · {currentIdentity?.name}
            </Text>
          </View>
          <ChevronRight color={colors.text_muted} size={18} />
        </TouchableOpacity>

        {/* Theme */}
        <Section label="Appearance" colors={colors} />
        <TouchableOpacity
          testID="settings-theme"
          onPress={() => setThemeOpen(true)}
          activeOpacity={0.7}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.primary_accent + '20' }]}>
            <Palette color={colors.primary_accent} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text_primary }]}>Theme</Text>
            <Text style={{ color: colors.text_secondary, fontSize: 12, marginTop: 2 }}>
              {THEMES[theme].label}
            </Text>
          </View>
          <ChevronRight color={colors.text_muted} size={18} />
        </TouchableOpacity>

        {/* Privacy modes */}
        <Section label="Privacy Modes" colors={colors} />

        <ToggleRow
          testID="toggle-ghost"
          colors={colors}
          icon={<Ghost color={colors.text_secondary} size={18} />}
          iconBg={colors.text_muted + '30'}
          title="Ghost Mode"
          desc="Hide read receipts and typing indicators"
          value={ghostMode}
          onChange={setGhostMode}
        />

        <ToggleRow
          testID="toggle-decoy"
          colors={colors}
          icon={<EyeOff color={colors.danger} size={18} />}
          iconBg={colors.danger + '20'}
          title="Decoy Mode"
          desc="Display a reduced chat list without vault chats"
          value={decoyMode}
          onChange={setDecoyMode}
        />

        {/* Vault */}
        <Section label="Vault" colors={colors} />
        <TouchableOpacity
          testID="settings-vault-pin"
          onPress={() => setPinOpen(true)}
          activeOpacity={0.7}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.secure_accent + '20' }]}>
            <KeyRound color={colors.secure_accent} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text_primary }]}>Vault PIN</Text>
            <Text style={{ color: colors.text_secondary, fontSize: 12, marginTop: 2 }}>
              {vaultPin ? 'PIN set · tap to change' : 'Not set · tap to configure'}
            </Text>
          </View>
          <ChevronRight color={colors.text_muted} size={18} />
        </TouchableOpacity>

        {/* About */}
        <Section label="About" colors={colors} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.primary_accent + '20' }]}>
            <Info color={colors.primary_accent} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text_primary }]}>
              Xenon Messenger
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: 12, marginTop: 2 }}>
              v1.0.0 · Simulated E2E demo · Stateless relay
            </Text>
          </View>
        </View>

        {/* Danger zone */}
        <Section label="Danger Zone" colors={colors} />
        <TouchableOpacity
          testID="settings-panic"
          onPress={onPanic}
          activeOpacity={0.7}
          style={[
            styles.card,
            { backgroundColor: colors.danger + '10', borderColor: colors.danger + '55' },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.danger + '20' }]}>
            <ShieldAlert color={colors.danger} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.danger }]}>Panic Mode</Text>
            <Text style={{ color: colors.danger + 'cc', fontSize: 12, marginTop: 2 }}>
              Wipe this identity and all chats
            </Text>
          </View>
          <Trash2 color={colors.danger} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-logout"
          onPress={onLogout}
          activeOpacity={0.7}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.text_muted + '30' }]}>
            <LogOut color={colors.text_secondary} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text_primary }]}>
              Switch Identity
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: 12, marginTop: 2 }}>
              Sign out and pick another XID
            </Text>
          </View>
          <ChevronRight color={colors.text_muted} size={18} />
        </TouchableOpacity>
      </ScrollView>

      {/* Theme modal */}
      <Modal visible={themeOpen} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', padding: 24 }}
          activeOpacity={1}
          onPress={() => setThemeOpen(false)}
        >
          <View
            style={[
              styles.themeModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: colors.text_primary,
                fontSize: 18,
                fontWeight: '800',
                marginBottom: 14,
              }}
            >
              Select theme
            </Text>
            {(Object.keys(THEMES) as ThemeName[]).map((name) => {
              const t = THEMES[name];
              const active = theme === name;
              return (
                <TouchableOpacity
                  testID={`theme-${name}`}
                  key={name}
                  onPress={() => {
                    setTheme(name);
                    setThemeOpen(false);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? t.primary_accent : colors.border,
                    marginBottom: 8,
                    gap: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row' }}>
                    {[t.background, t.surface, t.primary_accent, t.secure_accent].map((c, i) => (
                      <View
                        key={i}
                        style={{
                          width: 18,
                          height: 28,
                          backgroundColor: c,
                          borderRadius: 3,
                          marginLeft: i === 0 ? 0 : -4,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      />
                    ))}
                  </View>
                  <Text
                    style={{ flex: 1, color: colors.text_primary, fontWeight: '700', fontSize: 15 }}
                  >
                    {t.label}
                  </Text>
                  {active && <Check color={t.primary_accent} size={18} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* PIN modal */}
      <Modal visible={pinOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: '#000000cc',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={[
              styles.themeModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: colors.text_primary,
                fontSize: 18,
                fontWeight: '800',
                marginBottom: 6,
              }}
            >
              Set Vault PIN
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: 12, marginBottom: 14 }}>
              This PIN unlocks your vault chats.
            </Text>
            <TextInput
              testID="vault-pin-input"
              value={pinInput}
              onChangeText={setPinInput}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={{
                backgroundColor: colors.background,
                color: colors.text_primary,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 14,
                fontFamily: MONO,
                letterSpacing: 8,
                textAlign: 'center',
                fontSize: 18,
              }}
              placeholder="••••"
              placeholderTextColor={colors.text_muted}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  setPinInput('');
                  setPinOpen(false);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.text_primary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="vault-pin-save"
                onPress={savePin}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: colors.secure_accent,
                }}
              >
                <Text style={{ color: colors.background, fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </View>
            {vaultPin && (
              <TouchableOpacity
                testID="vault-pin-clear"
                onPress={() => {
                  setVaultPin(null);
                  setVaultUnlocked(false);
                  setPinOpen(false);
                }}
                style={{ marginTop: 12, alignItems: 'center' }}
              >
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>
                  Remove PIN
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ label, colors }: { label: string; colors: any }) {
  return (
    <Text
      style={{
        color: colors.text_muted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2,
        fontFamily: MONO,
        paddingHorizontal: 20,
        marginTop: 24,
        marginBottom: 10,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function ToggleRow({
  testID,
  colors,
  icon,
  iconBg,
  title,
  desc,
  value,
  onChange,
}: any) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: colors.text_primary }]}>{title}</Text>
        <Text style={{ color: colors.text_secondary, fontSize: 12, marginTop: 2 }}>{desc}</Text>
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary_accent }}
        thumbColor={value ? colors.background : colors.text_muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  themeModal: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
});
