export type ThemeName = 'obsidian' | 'frost' | 'nebula' | 'amber_vault';

export interface ThemeColors {
  background: string;
  surface: string;
  surface_elevated: string;
  border: string;
  primary_accent: string;
  secure_accent: string;
  danger: string;
  text_primary: string;
  text_secondary: string;
  text_muted: string;
}

export const THEMES: Record<ThemeName, ThemeColors & { label: string; isDark: boolean }> = {
  obsidian: {
    label: 'Obsidian',
    isDark: true,
    background: '#030303',
    surface: '#121212',
    surface_elevated: '#1A1A1A',
    border: '#27272A',
    primary_accent: '#00E5FF',
    secure_accent: '#39FF14',
    danger: '#FF2A2A',
    text_primary: '#FFFFFF',
    text_secondary: '#A1A1AA',
    text_muted: '#52525B',
  },
  frost: {
    label: 'Frost',
    isDark: false,
    background: '#F4F4F5',
    surface: '#FFFFFF',
    surface_elevated: '#E4E4E7',
    border: '#D4D4D8',
    primary_accent: '#00B8D4',
    secure_accent: '#00C853',
    danger: '#E53935',
    text_primary: '#09090B',
    text_secondary: '#52525B',
    text_muted: '#A1A1AA',
  },
  nebula: {
    label: 'Nebula',
    isDark: true,
    background: '#050014',
    surface: '#130030',
    surface_elevated: '#26005E',
    border: '#3B008F',
    primary_accent: '#D946EF',
    secure_accent: '#2DD4BF',
    danger: '#F43F5E',
    text_primary: '#FFFFFF',
    text_secondary: '#C4B5FD',
    text_muted: '#7C3AED',
  },
  amber_vault: {
    label: 'Amber Vault',
    isDark: true,
    background: '#0A0800',
    surface: '#1A1400',
    surface_elevated: '#292000',
    border: '#4D3C00',
    primary_accent: '#FFB300',
    secure_accent: '#FFD54F',
    danger: '#FF3B30',
    text_primary: '#FFFDF5',
    text_secondary: '#BFA75D',
    text_muted: '#736436',
  },
};

export const MONO = 'Menlo';
