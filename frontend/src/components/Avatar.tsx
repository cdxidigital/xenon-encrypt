import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';

interface Props {
  label: string;
  seed?: string;
  size?: number;
  testID?: string;
}

const COLORS = [
  '#00E5FF',
  '#39FF14',
  '#FFB300',
  '#D946EF',
  '#F43F5E',
  '#2DD4BF',
  '#FFD54F',
  '#FF6B6B',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Avatar({ label, seed, size = 48, testID }: Props) {
  const { colors } = useApp();
  const key = seed || label;
  const bg = COLORS[hash(key) % COLORS.length];
  const initial = (label || '?').trim().charAt(0).toUpperCase();
  return (
    <View
      testID={testID}
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: colors.surface_elevated,
          borderColor: bg + '66',
        },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: bg + '22', borderRadius: size * 0.28 },
        ]}
      />
      <Text
        style={{
          color: bg,
          fontSize: size * 0.4,
          fontWeight: '800',
          letterSpacing: 0.5,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
