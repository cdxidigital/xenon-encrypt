import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/context/AppContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#030303' },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="new-chat" options={{ presentation: 'modal' }} />
          <Stack.Screen name="identities" options={{ presentation: 'modal' }} />
          <Stack.Screen name="vault-unlock" options={{ presentation: 'modal' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
