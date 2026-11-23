import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ColorThemeId =
  | 'plum'
  | 'ocean'
  | 'emerald'
  | 'indigo'
  | 'rose'
  | 'amber'
  | 'aurora'
  | 'sunset'
  | 'northern'
  | 'galaxy';

export interface ColorThemeOption {
  id: ColorThemeId;
  name: string;
  desc: string;
  swatchLight: string;
  swatchDark: string;
  isGradient?: boolean;
  swatchGradient?: string;
}

export const COLOR_THEMES: ColorThemeOption[] = [
  {
    id: 'plum',
    name: 'FinX Plum',
    desc: 'Tím thương hiệu',
    swatchLight: '#851fb6',
    swatchDark: '#c16ee8',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    desc: 'Xanh đại dương',
    swatchLight: '#2563eb',
    swatchDark: '#60a5fa',
  },
  {
    id: 'emerald',
    name: 'Emerald Mint',
    desc: 'Xanh ngọc dịu mắt',
    swatchLight: '#059669',
    swatchDark: '#34d399',
  },
  {
    id: 'indigo',
    name: 'Indigo Slate',
    desc: 'Chàm hiện đại',
    swatchLight: '#4f46e5',
    swatchDark: '#818cf8',
  },
  {
    id: 'rose',
    name: 'Rose Crimson',
    desc: 'Hồng đỏ nổi bật',
    swatchLight: '#e11d48',
    swatchDark: '#fb7185',
  },
  {
    id: 'amber',
    name: 'Amber Sunset',
    desc: 'Hổ phách ấm áp',
    swatchLight: '#d97706',
    swatchDark: '#fbbf24',
  },
  {
    id: 'aurora',
    name: 'Aurora Cyber',
    desc: 'Tím · Hồng · Cyan',
    swatchLight: '#7c3aed',
    swatchDark: '#c084fc',
    isGradient: true,
    swatchGradient: 'linear-gradient(135deg, #7c3aed 0%, #db2777 52%, #06b6d4 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    desc: 'Hồng · Cam · Vàng',
    swatchLight: '#e11d48',
    swatchDark: '#fb923c',
    isGradient: true,
    swatchGradient: 'linear-gradient(135deg, #e11d48 0%, #f97316 55%, #facc15 100%)',
  },
  {
    id: 'northern',
    name: 'Northern Sea',
    desc: 'Chàm · Lam · Ngọc',
    swatchLight: '#0284c7',
    swatchDark: '#34d399',
    isGradient: true,
    swatchGradient: 'linear-gradient(135deg, #4f46e5 0%, #0284c7 50%, #10b981 100%)',
  },
  {
    id: 'galaxy',
    name: 'Neon Galaxy',
    desc: 'Lam · Tím · Hồng',
    swatchLight: '#6d28d9',
    swatchDark: '#f472b6',
    isGradient: true,
    swatchGradient: 'linear-gradient(135deg, #2563eb 0%, #9333ea 52%, #ec4899 100%)',
  },
];

const MODE_STORAGE_KEY = 'finx_tcms_theme';
const COLOR_STORAGE_KEY = 'finx_tcms_color_theme';
const VALID_COLORS = new Set<ColorThemeId>(COLOR_THEMES.map((t) => t.id));

function readInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function readInitialColorTheme(): ColorThemeId {
  try {
    const saved = localStorage.getItem(COLOR_STORAGE_KEY) as ColorThemeId | null;
    if (saved && VALID_COLORS.has(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 'plum';
}

function applyThemeClass(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

function applyColorThemeAttr(color: ColorThemeId) {
  document.documentElement.setAttribute('data-color-theme', color);
}

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  colorTheme: ColorThemeId;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setColorTheme: (color: ColorThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>(readInitialColorTheme);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    applyColorThemeAttr(colorTheme);
    try {
      localStorage.setItem(COLOR_STORAGE_KEY, colorTheme);
    } catch {
      // ignore storage errors
    }
  }, [colorTheme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setColorTheme = useCallback((color: ColorThemeId) => {
    setColorThemeState(color);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        colorTheme,
        setTheme,
        toggleTheme,
        setColorTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
