import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage, SUPPORTED_LANGUAGES, LanguageCode } from '../context/LanguageContext.tsx';
import { Clock, Star, Globe, ChevronDown, Check } from 'lucide-react';

interface QuickTourProps {
  isOpen: boolean;
  onClose: () => void;
  onStepChange?: (step: number) => void;
  onOpenInstrumentForTour?: () => void;
  onCloseInstrumentForTour?: () => void;
  setOrderWindowView?: (view: 'ORDER' | 'CHART') => void;
}

interface StepConfig {
  id: number;
  targetId: string;
  titleKey: string;
  descKey: string;
  defaultTitle: string;
  defaultDesc: string;
  preferredPlacement?: 'top' | 'bottom';
}

const TOUR_STEPS: StepConfig[] = [
  {
    id: 1,
    targetId: 'tour-target-watchlist',
    titleKey: 'step1Title',
    descKey: 'step1Desc',
    defaultTitle: 'Your Watchlist',
    defaultDesc: 'Keep the instruments you follow in one place and monitor their latest market prices.',
    preferredPlacement: 'top',
  },
  {
    id: 2,
    targetId: 'tour-target-categories',
    titleKey: 'step2Title',
    descKey: 'step2Desc',
    defaultTitle: 'Explore Markets',
    defaultDesc: 'Switch between market categories to quickly find the instruments you want to trade.',
    preferredPlacement: 'bottom',
  },
  {
    id: 3,
    targetId: 'tour-target-search',
    titleKey: 'step3Title',
    descKey: 'step3Desc',
    defaultTitle: 'Find an Instrument',
    defaultDesc: 'Search for an instrument by name or symbol to quickly open its market details.',
    preferredPlacement: 'bottom',
  },
  {
    id: 4,
    targetId: 'tour-target-first-instrument',
    titleKey: 'step4Title',
    descKey: 'step4Desc',
    defaultTitle: 'Understand Market Data',
    defaultDesc: 'Each instrument shows its current price, price movement and your Intraday and Holding values.',
    preferredPlacement: 'bottom',
  },
  {
    id: 5,
    targetId: 'tour-target-instrument-header',
    titleKey: 'step5Title',
    descKey: 'step5Desc',
    defaultTitle: 'Open the Trading Screen',
    defaultDesc: 'Tap an instrument to view its market information and access the order panel.',
    preferredPlacement: 'bottom',
  },
  {
    id: 6,
    targetId: 'tour-target-price-chart',
    titleKey: 'step6Title',
    descKey: 'step6Desc',
    defaultTitle: 'Read the Price Chart',
    defaultDesc: 'Watch live price movement on the candlestick chart. Green candle = price rose, Red candle = price fell. Use timeframes to zoom in or out.',
    preferredPlacement: 'bottom',
  },
  {
    id: 7,
    targetId: 'tour-target-order-builder',
    titleKey: 'step7Title',
    descKey: 'step7Desc',
    defaultTitle: 'Build Your Order',
    defaultDesc: 'Choose your quantity and order type. You can also configure Stop Loss or Target before placing an order.',
    preferredPlacement: 'top',
  },
  {
    id: 8,
    targetId: 'tour-target-action-buttons',
    titleKey: 'step8Title',
    descKey: 'step8Desc',
    defaultTitle: 'Review & Place Your Trade',
    defaultDesc: "Review the order details, then choose Sell or Buy to submit your order. You're practicing with virtual funds — no real money involved.",
    preferredPlacement: 'top',
  },
];

export const QuickTour: React.FC<QuickTourProps> = ({
  isOpen,
  onClose,
  onStepChange,
  onOpenInstrumentForTour,
  onCloseInstrumentForTour,
  setOrderWindowView,
}) => {
  const { language, setLanguage, currentLanguage, t } = useLanguage();

  // Mode: 'welcome' (Screenshot 1) or 'guided' (Screenshots 2-9)
  const [tourMode, setTourMode] = useState<'welcome' | 'guided'>('welcome');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close language dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    if (isLangDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isLangDropdownOpen]);

  // Update target bounding rect for spotlight and card positioning
  const updateTargetPosition = useCallback(() => {
    if (tourMode !== 'guided') return;
    const stepConfig = TOUR_STEPS[currentStep - 1];
    if (!stepConfig) return;

    const el = document.getElementById(stepConfig.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Ensure target is somewhat visible in viewport
      const isInViewport =
        rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
      if (!isInViewport) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setTargetRect(null);
    }
  }, [tourMode, currentStep]);

  // Synchronize state when moving across steps
  useEffect(() => {
    if (!isOpen) return;

    if (onStepChange) {
      onStepChange(tourMode === 'welcome' ? 0 : currentStep);
    }

    if (tourMode === 'guided') {
      // Step transitions
      if (currentStep >= 5) {
        onOpenInstrumentForTour?.();
        if (currentStep === 6) {
          setOrderWindowView?.('CHART');
        } else if (currentStep === 7 || currentStep === 8) {
          setOrderWindowView?.('ORDER');
        }
      } else {
        onCloseInstrumentForTour?.();
      }

      // Allow DOM to settle before measuring
      const timer = setTimeout(() => {
        updateTargetPosition();
      }, 150);

      window.addEventListener('resize', updateTargetPosition);
      window.addEventListener('scroll', updateTargetPosition, true);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateTargetPosition);
        window.removeEventListener('scroll', updateTargetPosition, true);
      };
    }
  }, [
    isOpen,
    tourMode,
    currentStep,
    onStepChange,
    onOpenInstrumentForTour,
    onCloseInstrumentForTour,
    setOrderWindowView,
    updateTargetPosition,
  ]);

  if (!isOpen) return null;

  const handleStartTour = () => {
    setTourMode('guided');
    setCurrentStep(1);
    onCloseInstrumentForTour?.();
  };

  const handleNext = () => {
    if (currentStep < 8) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    try {
      localStorage.setItem('goldfut_tour_completed', 'true');
    } catch {
      // ignore
    }
    onClose();
  };

  const handleSkip = () => {
    handleFinish();
  };

  const stepConfig = TOUR_STEPS[currentStep - 1] || TOUR_STEPS[0];
  const stepTitle = t(stepConfig.titleKey) || stepConfig.defaultTitle;
  const stepDesc = t(stepConfig.descKey) || stepConfig.defaultDesc;

  // Decide card positioning relative to target element
  let cardPositionClasses = 'top-6 left-1/2 -translate-x-1/2';
  if (targetRect) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    if (stepConfig.preferredPlacement === 'top' && spaceAbove > 180) {
      cardPositionClasses = `bottom-[calc(100vh-${Math.max(16, targetRect.top - 16)}px)] left-1/2 -translate-x-1/2`;
    } else if (spaceBelow > 200) {
      cardPositionClasses = `top-[${Math.min(window.innerHeight - 220, targetRect.bottom + 16)}px] left-1/2 -translate-x-1/2`;
    } else if (spaceAbove > 200) {
      cardPositionClasses = `top-[${Math.max(16, targetRect.top - 200)}px] left-1/2 -translate-x-1/2`;
    } else {
      cardPositionClasses = 'top-6 left-1/2 -translate-x-1/2';
    }
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto">
      {/* 1. WELCOME MODAL DIALOG (Screenshot 1) */}
      {tourMode === 'welcome' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl w-full max-w-md p-6 sm:p-7 shadow-2xl relative overflow-visible">
            {/* Top Accent Bar (Orange Pill) */}
            <div className="w-9 h-1 bg-amber-500 rounded-full mb-5" />

            {/* Language Selector Dropdown (Top Right Corner matching Screenshot 1) */}
            <div className="absolute top-6 right-6" ref={langMenuRef}>
              <button
                type="button"
                id="tour-welcome-lang-btn"
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#0E1626] dark:hover:bg-[#142034] border border-slate-300 dark:border-slate-700/80 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-95"
              >
                <Globe className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>{currentLanguage.englishName}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isLangDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-[#1E2B40] rounded-xl shadow-2xl py-1.5 z-50 backdrop-blur-md max-h-72 overflow-y-auto animate-fadeIn">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    Select Language
                  </div>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        setLanguage(lang.code as LanguageCode);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        language === lang.code
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{lang.nativeName}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{lang.englishName}</span>
                      </div>
                      {language === lang.code && <Check className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Brand Logo and Title: GF + Welcome to GoldFut */}
            <div className="flex items-center gap-3 mt-1 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-amber-500/20">
                GF
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t('welcomeToGoldfut')}
              </h2>
            </div>

            {/* Subtitle & Description matching Screenshot 1 */}
            <div className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
              <p className="font-semibold text-slate-800 dark:text-slate-200">{t('tourSubtitle')}</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs">{t('tourDescription')}</p>
            </div>

            {/* Badges: 2 min + 8 steps matching Screenshot 1 */}
            <div className="flex items-center gap-2 mb-6">
              <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-[#0E1626] border border-amber-200 dark:border-[#1C2C42] text-amber-700 dark:text-amber-400 text-xs font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{t('tourEstimatedTime')}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0E1626] border border-slate-200 dark:border-[#1C2C42] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>{t('tourStepCount')}</span>
              </div>
            </div>

            {/* Primary Action Button: Start Guided Tour */}
            <button
              type="button"
              id="tour-start-btn"
              onClick={handleStartTour}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              {t('startGuidedTour')}
            </button>

            {/* Secondary Action Link: Maybe later */}
            <button
              type="button"
              id="tour-maybe-later-btn"
              onClick={handleSkip}
              className="w-full text-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mt-3 py-1.5 transition-colors cursor-pointer"
            >
              {t('maybeLater')}
            </button>
          </div>
        </div>
      )}

      {/* 2. INTERACTIVE GUIDED TOUR STEPS (Screenshots 2-9) */}
      {tourMode === 'guided' && (
        <>
          {/* True Spotlight Cutout Overlay */}
          {targetRect ? (
            <div
              className="fixed rounded-2xl border-2 border-amber-500 pointer-events-none transition-all duration-300 z-40 shadow-[0_0_15px_rgba(245,158,11,0.35),0_0_0_9999px_rgba(4,7,14,0.85)]"
              style={{
                top: Math.max(0, targetRect.top - 6),
                left: Math.max(0, targetRect.left - 6),
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          ) : (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-40 transition-opacity" />
          )}

          {/* Guided Tour Banner Card matching Screenshots 2 to 9 */}
          <div className="fixed inset-x-0 z-50 px-3 sm:px-4 pointer-events-none flex justify-center top-4 sm:top-6">
            <div className="pointer-events-auto bg-white/95 dark:bg-[#0B111C]/98 border border-amber-500/50 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md w-full max-w-2xl animate-fadeIn text-left">
              {/* Top Header: 8 indicator dots + Step counter */}
              <div className="flex items-center justify-between">
                {/* Dots row matching screenshots: active is elongated amber bar, others small dots */}
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((stepNum) => (
                    <span
                      key={stepNum}
                      className={`transition-all duration-200 rounded-full ${
                        stepNum === currentStep
                          ? 'w-7 h-1.5 bg-amber-500 shadow-xs shadow-amber-500/40'
                          : 'w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  ))}
                </div>

                {/* Step Counter: e.g. "1 of 8" */}
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  {currentStep} of 8
                </span>
              </div>

              {/* Title matching screenshot */}
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight mt-3">
                {stepTitle}
              </h3>

              {/* Description body text */}
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {stepDesc}
              </p>

              {/* Footer actions matching screenshot */}
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-[#162234]">
                {/* Skip Tour link */}
                <button
                  type="button"
                  id="tour-skip-step-btn"
                  onClick={handleSkip}
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {t('skipTour')}
                </button>

                {/* Navigation Buttons: Back and Next/Finish */}
                <div className="flex items-center gap-2">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      id="tour-back-step-btn"
                      onClick={handleBack}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-[#1E2E44] text-slate-800 dark:text-white border border-slate-300 dark:border-[#223652] transition-colors cursor-pointer active:scale-95"
                    >
                      {t('back')}
                    </button>
                  )}

                  <button
                    type="button"
                    id="tour-next-step-btn"
                    onClick={handleNext}
                    className="px-4 py-1.5 text-xs font-black rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
                  >
                    {currentStep === 8 ? t('finish') : t('next')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
