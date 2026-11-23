import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, tx } = useLanguage();

  return (
    <div
      role="group"
      aria-label={tx('Chọn ngôn ngữ', 'Select language')}
      className="inline-flex items-center rounded-xl border border-hairline bg-white p-0.5 text-[11px] font-semibold"
    >
      {!compact && <Globe className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1 shrink-0" />}
      <button
        type="button"
        onClick={() => setLang('vi')}
        aria-pressed={lang === 'vi'}
        title="Tiếng Việt"
        className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
          lang === 'vi'
            ? 'bg-brand-600 text-white shadow-2xs'
            : 'text-slate-500 hover:text-ink'
        }`}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        title="English"
        className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
          lang === 'en'
            ? 'bg-brand-600 text-white shadow-2xs'
            : 'text-slate-500 hover:text-ink'
        }`}
      >
        EN
      </button>
    </div>
  );
}
