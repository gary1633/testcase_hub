import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Language = 'vi' | 'en';

const LANG_STORAGE_KEY = 'finx_tcms_lang';

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'vi';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // ignore storage errors
  }
  return 'vi';
}

interface LanguageContextValue {
  lang: Language;
  isEn: boolean;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  /** Quick inline bilingual helper: returns Vietnamese or English string based on active language */
  tx: (vi: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'vi' ? 'en' : 'vi'));
  }, []);

  const tx = useCallback((vi: string, en: string) => (lang === 'en' ? en : vi), [lang]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isEn: lang === 'en',
        setLang,
        toggleLang,
        tx,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
