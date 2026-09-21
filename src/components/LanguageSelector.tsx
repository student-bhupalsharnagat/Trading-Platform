import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useLanguage, LanguageCode } from '../context/LanguageContext.tsx';
import { useAuth } from '../hooks/useAuth.ts';

export const LanguageSelector: React.FC = () => {
  const { language, currentLanguage, setLanguage } = useLanguage();
  const { showToast } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectLanguage = (code: LanguageCode, nativeName: string, englishName: string) => {
    setLanguage(code);
    setIsOpen(false);
    showToast({
      type: 'info',
      title: 'Language Updated',
      description: `${nativeName} (${englishName}) selected.`,
      duration: 3000,
    });
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Language Trigger Button matching Screenshot 1 & 2 */}
      <button
        type="button"
        id="language-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
          isOpen
            ? 'bg-amber-500/15 border-amber-500/60 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40'
            : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900 dark:bg-[#0E1626] dark:hover:bg-[#152238] dark:border-slate-700/60 dark:text-slate-200 dark:hover:text-white'
        }`}
        title="Select Language"
      >
        <Globe className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 stroke-[2.2]" />
        <span className="font-medium tracking-tight">{currentLanguage.englishName}</span>
      </button>

      {/* Language Dropdown Menu matching Screenshot 2 */}
      {isOpen && (
        <div
          id="language-dropdown-menu"
          className="absolute right-0 top-full mt-2 w-56 sm:w-60 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E2E44] rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-scaleUp py-1.5 divide-y divide-slate-100 dark:divide-[#162234]"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="py-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  id={`language-option-${lang.code}`}
                  onClick={() => handleSelectLanguage(lang.code, lang.nativeName, lang.englishName)}
                  role="menuitem"
                  className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer group ${
                    isSelected
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#162234] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {/* Left: Native script name */}
                  <span className="text-sm font-medium tracking-wide flex items-center gap-2">
                    {lang.nativeName}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 stroke-[2.5]" />
                    )}
                  </span>

                  {/* Right: English name */}
                  <span
                    className={`text-xs font-mono transition-colors ${
                      isSelected
                        ? 'text-amber-600 dark:text-amber-300 font-bold'
                        : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                    }`}
                  >
                    {lang.englishName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
