import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../src/context/AppContext';

export default function Index() {
  const router = useRouter();
  const { loaded, currentXid, colors } = useApp();

  useEffect(() => {
    if (!loaded) return;
    if (currentXid) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }, [loaded, currentXid, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={colors.primary_accent} />
    </View>
  );
}
