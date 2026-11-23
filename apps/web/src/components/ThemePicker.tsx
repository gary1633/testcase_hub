import React, { useEffect, useRef, useState } from 'react';
import { Check, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { COLOR_THEMES, type ColorThemeOption, useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

const SOLID_THEMES = COLOR_THEMES.filter((t) => !t.isGradient);
const GRADIENT_THEMES = COLOR_THEMES.filter((t) => t.isGradient);

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { isDark, colorTheme, setTheme, setColorTheme } = useTheme();
  const { tx } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeColor = COLOR_THEMES.find((t) => t.id === colorTheme) ?? COLOR_THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const renderThemeButton = (opt: ColorThemeOption) => {
    const selected = opt.id === colorTheme;
    const bgStyle = opt.swatchGradient
      ? { backgroundImage: opt.swatchGradient }
      : { backgroundColor: isDark ? opt.swatchDark : opt.swatchLight };

    return (
      <button
        key={opt.id}
        type="button"
        onClick={() => setColorTheme(opt.id)}
        className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
          selected
            ? 'border-brand-500 bg-brand-50/70'
            : 'border-hairline hover:border-slate-300 hover:bg-canvas'
        }`}
      >
        <span
          className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center shadow-2xs ring-1 ring-black/10"
          style={bgStyle}
        >
          {selected && <Check className="w-3 h-3 text-white stroke-[3]" />}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink truncate leading-tight">{opt.name}</div>
          <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">{opt.desc}</div>
        </div>
      </button>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={tx('Tùy chỉnh giao diện Sáng/Tối & Bảng màu', 'Customize Light/Dark mode & color theme')}
        title={tx(
          `Giao diện: ${isDark ? 'Tối' : 'Sáng'} · ${activeColor.name}`,
          `Appearance: ${isDark ? 'Dark' : 'Light'} · ${activeColor.name}`,
        )}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white hover:bg-canvas text-slate-600 hover:text-ink transition-colors cursor-pointer ${
          compact ? 'px-2.5 py-1.5' : 'px-2.5 py-1.5'
        }`}
      >
        <span
          className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/20 shadow-2xs"
          style={
            activeColor.swatchGradient
              ? { backgroundImage: activeColor.swatchGradient }
              : { backgroundColor: isDark ? activeColor.swatchDark : activeColor.swatchLight }
          }
        />
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={tx('Cài đặt giao diện và màu sắc', 'Appearance and color settings')}
          className="animate-modal absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-hairline shadow-2xl p-3.5 z-50 space-y-3.5"
        >
          {/* Appearance Light / Dark */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {tx('Chế độ hiển thị', 'Appearance')}
              </span>
              <span className="text-[11px] text-slate-400">{isDark ? 'Dark' : 'Light'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-canvas border border-hairline">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !isDark
                    ? 'bg-white text-brand-700 shadow-xs border border-hairline'
                    : 'text-slate-500 hover:text-ink border border-transparent'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                {tx('Sáng (Light)', 'Light')}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isDark
                    ? 'bg-white text-brand-700 shadow-xs border border-hairline'
                    : 'text-slate-500 hover:text-ink border border-transparent'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                {tx('Tối (Dark)', 'Dark')}
              </button>
            </div>
          </div>

          {/* Solid Color Themes */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Palette className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {tx('Bảng màu đơn (Solid)', 'Solid Colors')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">{SOLID_THEMES.map(renderThemeButton)}</div>
          </div>

          {/* Gradient Color Themes */}
          <div className="pt-1 border-t border-hairline">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                {tx('Chuyển sắc (Gradient)', 'Gradient Themes')}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                4 kiểu
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">{GRADIENT_THEMES.map(renderThemeButton)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
