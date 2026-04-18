import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, ThemeName, ThemeColors } from '../theme';

export interface Identity {
  id: string;
  xid: string;
  name: string;
  avatar_seed: string;
  public_key: string;
  disposable: boolean;
  created_at: string;
}

interface AppCtx {
  theme: ThemeName;
  colors: ThemeColors & { label: string; isDark: boolean };
  setTheme: (t: ThemeName) => void;
  currentXid: string | null;
  currentIdentity: Identity | null;
  setCurrentXid: (xid: string | null) => Promise<void>;
  identities: Identity[];
  refreshIdentities: () => Promise<void>;
  ghostMode: boolean;
  setGhostMode: (v: boolean) => void;
  vaultUnlocked: boolean;
  setVaultUnlocked: (v: boolean) => void;
  decoyMode: boolean;
  setDecoyMode: (v: boolean) => void;
  vaultPin: string | null;
  setVaultPin: (p: string | null) => Promise<void>;
  loaded: boolean;
}

const AppContext = createContext<AppCtx | null>(null);

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('obsidian');
  const [currentXid, setCurrentXidState] = useState<string | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [ghostMode, setGhostModeState] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [decoyMode, setDecoyModeState] = useState(false);
  const [vaultPin, setVaultPinState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refreshIdentities = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/identities`);
      if (res.ok) {
        const data = await res.json();
        setIdentities(data);
      }
    } catch (e) {
      console.log('refreshIdentities error', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [t, x, g, d, pin] = await Promise.all([
        AsyncStorage.getItem('xenon.theme'),
        AsyncStorage.getItem('xenon.currentXid'),
        AsyncStorage.getItem('xenon.ghost'),
        AsyncStorage.getItem('xenon.decoy'),
        AsyncStorage.getItem('xenon.vaultPin'),
      ]);
      if (t) setThemeState(t as ThemeName);
      if (x) setCurrentXidState(x);
      if (g === '1') setGhostModeState(true);
      if (d === '1') setDecoyModeState(true);
      if (pin) setVaultPinState(pin);
      await refreshIdentities();
      setLoaded(true);
    })();
  }, [refreshIdentities]);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    AsyncStorage.setItem('xenon.theme', t);
  };

  const setCurrentXid = async (xid: string | null) => {
    setCurrentXidState(xid);
    if (xid) await AsyncStorage.setItem('xenon.currentXid', xid);
    else await AsyncStorage.removeItem('xenon.currentXid');
  };

  const setGhostMode = (v: boolean) => {
    setGhostModeState(v);
    AsyncStorage.setItem('xenon.ghost', v ? '1' : '0');
  };
  const setDecoyMode = (v: boolean) => {
    setDecoyModeState(v);
    AsyncStorage.setItem('xenon.decoy', v ? '1' : '0');
  };
  const setVaultPin = async (p: string | null) => {
    setVaultPinState(p);
    if (p) await AsyncStorage.setItem('xenon.vaultPin', p);
    else await AsyncStorage.removeItem('xenon.vaultPin');
  };

  const currentIdentity = identities.find((i) => i.xid === currentXid) || null;

  return (
    <AppContext.Provider
      value={{
        theme,
        colors: THEMES[theme],
        setTheme,
        currentXid,
        currentIdentity,
        setCurrentXid,
        identities,
        refreshIdentities,
        ghostMode,
        setGhostMode,
        vaultUnlocked,
        setVaultUnlocked,
        decoyMode,
        setDecoyMode,
        vaultPin,
        setVaultPin,
        loaded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
