import { Tabs } from 'expo-router';
import { MessageSquare, Users, Settings as SettingsIcon } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';

export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: colors.primary_accent,
        tabBarInactiveTintColor: colors.text_muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'CHATS',
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'CONTACTS',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SETTINGS',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
