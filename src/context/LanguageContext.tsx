import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type LanguageCode = 'en' | 'hi' | 'gu' | 'kn' | 'te' | 'ml' | 'mr' | 'ta';

export interface LanguageOption {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil' },
];

export const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    availableMargin: 'AVAILABLE MARGIN',
    todayPnl: "TODAY'S P&L",
    overallPnl: 'OVERALL P&L',
    watchlist: 'WATCHLIST',
    orders: 'ORDERS',
    portfolio: 'PORTFOLIO',
    history: 'HISTORY',
    profile: 'PROFILE',
    positions: 'POSITIONS',
    searchPlaceholder: 'Search instruments... e.g. NIFTY, GOLD, BTC',
    instruments: 'Instruments',
    intraday: 'INTRADAY',
    holding: 'HOLDING',
    wallet: 'Wallet',
    logout: 'Logout',
    liveFeed: 'Live Feed',
    all: 'ALL',
    crypto: 'CRYPTO',
    equity: 'EQUITY',
    forex: 'FOREX',
    commodity: 'COMMODITY',
    index: 'INDEX',
    buy: 'BUY',
    sell: 'SELL',
    openPositions: 'Open Positions',
    active: 'ACTIVE',
    tradeMore: 'Trade More',
    totalUnrealizedPnl: 'Total Unrealized P&L',
    profit: 'PROFIT',
    loss: 'LOSS',
    exitPosition: 'Exit Position',
    chart: 'Chart',
    welcomeToGoldfut: 'Welcome to GoldFut',
    tourSubtitle: "Let's take a quick tour of your trading workspace.",
    tourDescription: 'Learn how to find instruments, read market data and place your first practice trade.',
    startGuidedTour: 'Start Guided Tour',
    maybeLater: 'Maybe later',
    skipTour: 'Skip Tour',
    back: 'Back',
    next: 'Next',
    finish: 'Finish',
    tourEstimatedTime: '2 min',
    tourStepCount: '8 steps',
    step1Title: 'Your Watchlist',
    step1Desc: 'Keep the instruments you follow in one place and monitor their latest market prices.',
    step2Title: 'Explore Markets',
    step2Desc: 'Switch between market categories to quickly find the instruments you want to trade.',
    step3Title: 'Find an Instrument',
    step3Desc: 'Search for an instrument by name or symbol to quickly open its market details.',
    step4Title: 'Understand Market Data',
    step4Desc: 'Each instrument shows its current price, price movement and your Intraday and Holding values.',
    step5Title: 'Open the Trading Screen',
    step5Desc: 'Tap an instrument to view its market information and access the order panel.',
    step6Title: 'Read the Price Chart',
    step6Desc: 'Watch live price movement on the candlestick chart. Green candle = price rose, Red candle = price fell. Use timeframes to zoom in or out.',
    step7Title: 'Build Your Order',
    step7Desc: 'Choose your quantity and order type. You can also configure Stop Loss or Target before placing an order.',
    step8Title: 'Review & Place Your Trade',
    step8Desc: "Review the order details, then choose Sell or Buy to submit your order. You're practicing with virtual funds — no real money involved.",
  },
  hi: {
    availableMargin: 'उपलब्ध मार्जिन',
    todayPnl: 'आज का P&L',
    overallPnl: 'कुल P&L',
    watchlist: 'वॉचलिस्ट',
    orders: 'ऑर्डर्स',
    portfolio: 'पोर्टफोलियो',
    history: 'इतिहास',
    profile: 'प्रोफ़ाइल',
    positions: 'पोजीशन्स',
    searchPlaceholder: 'इंस्ट्रूमेंट्स खोजें... जैसे NIFTY, GOLD, BTC',
    instruments: 'इंस्ट्रूमेंट्स',
    intraday: 'इंट्राडे',
    holding: 'होल्डिंग',
    wallet: 'वॉलेट',
    logout: 'लॉगआउट',
    liveFeed: 'लाइव फीड',
    all: 'सभी',
    crypto: 'क्रिप्टो',
    equity: 'इक्विटी',
    forex: 'फॉरेक्स',
    commodity: 'कमोडिटी',
    index: 'इंडेक्स',
    buy: 'खरीदें',
    sell: 'बेचें',
    openPositions: 'खुली पोजीशन्स',
    active: 'सक्रिय',
    tradeMore: 'और ट्रेड करें',
    totalUnrealizedPnl: 'कुल अवास्तविक P&L',
    profit: 'लाभ (PROFIT)',
    loss: 'हानि (LOSS)',
    exitPosition: 'पोजीशन बंद करें',
    chart: 'चार्ट',
  },
  gu: {
    availableMargin: 'ઉપલબ્ધ માર્જિન',
    todayPnl: 'આજનો P&L',
    overallPnl: 'કુલ P&L',
    watchlist: 'વોચલિસ્ટ',
    orders: 'ઓર્ડર્સ',
    portfolio: 'પોર્ટફોલિયો',
    history: 'ઇતિહાસ',
    profile: 'પ્રોફાઇલ',
    positions: 'પોઝિશન્સ',
    searchPlaceholder: 'સાધનો શોધો... જેમ કે NIFTY, GOLD, BTC',
    instruments: 'સાધનો',
    intraday: 'ઇન્ટ્રાડે',
    holding: 'હોલ્ડિંગ',
    wallet: 'વોલેટ',
    logout: 'લૉગઆઉટ',
    liveFeed: 'લાઇવ ફીડ',
    all: 'બધા',
    crypto: 'ક્રિપ્ટો',
    equity: 'ઇક્વિટી',
    forex: 'ફોરેક્સ',
    commodity: 'કોમોડિટી',
    index: 'ઇન્ડેક્સ',
    buy: 'ખરીદો',
    sell: 'વેચો',
    openPositions: 'ખુલ્લી પોઝિશન્સ',
    active: 'સક્રિય',
    tradeMore: 'વધુ ટ્રેડ કરો',
    totalUnrealizedPnl: 'કુલ અવાસ્તવિક P&L',
    profit: 'નફો (PROFIT)',
    loss: 'નુકસાન (LOSS)',
    exitPosition: 'પોઝિશન બંધ કરો',
    chart: 'ચાર્ટ',
  },
  kn: {
    availableMargin: 'ಲಭ್ಯವಿರುವ ಮಾರ್ಜಿನ್',
    todayPnl: 'ಇಂದಿನ P&L',
    overallPnl: 'ಒಟ್ಟು P&L',
    watchlist: 'ವಾಚ್‌ಲಿಸ್ಟ್',
    orders: 'ಆರ್ಡರ್‌ಗಳು',
    portfolio: 'ಪೋರ್ಟ್‌ಫೋಲಿಯೋ',
    history: 'ಇತಿಹಾಸ',
    profile: 'ಪ್ರೊಫೈಲ್',
    positions: 'ಪೊಸಿಷನ್‌ಗಳು',
    searchPlaceholder: 'ಉಪಕರಣಗಳನ್ನು ಹುಡುಕಿ... ಉದಾ. NIFTY, GOLD, BTC',
    instruments: 'ಉಪಕರಣಗಳು',
    intraday: 'ಇಂಟ್ರಾಡೇ',
    holding: 'ಹೋಲ್ಡಿಂಗ್',
    wallet: 'ವಾಲೆಟ್',
    logout: 'ಲಾಗ್‌ಔಟ್',
    liveFeed: 'ಲೈವ್ ಫೀಡ್',
    all: 'ಎಲ್ಲವೂ',
    crypto: 'ಕ್ರಿಪ್ಟೋ',
    equity: 'ಈಕ್ವಿಟಿ',
    forex: 'ಫಾರೆಕ್ಸ್',
    commodity: 'ಕಮಾಡಿಟಿ',
    index: 'ಇಂಡೆಕ್ಸ್',
    buy: 'ಖರೀದಿಸಿ',
    sell: 'ಮಾರಾಟ',
    openPositions: 'ತೆರೆದ ಪೊಸಿಷನ್‌ಗಳು',
    active: 'ಸಕ್ರಿಯ',
    tradeMore: 'ಹೆಚ್ಚು ಟ್ರೇಡ್ ಮಾಡಿ',
    totalUnrealizedPnl: 'ಒಟ್ಟು ರಿಯಲೈಸ್ ಆಗದ P&L',
    profit: 'ಲಾಭ (PROFIT)',
    loss: 'ನಷ್ಟ (LOSS)',
    exitPosition: 'ಪೊಸಿಷನ್ ಮುಕ್ತಾಯ',
    chart: 'ಚಾರ್ಟ್',
  },
  te: {
    availableMargin: 'అందుబాటులో ఉన్న మార్జిన్',
    todayPnl: 'ఈ రోజు P&L',
    overallPnl: 'మొత్తం P&L',
    watchlist: 'వాచ్‌లిస్ట్',
    orders: 'ఆర్డర్లు',
    portfolio: 'పోర్ట్‌ఫోలియో',
    history: 'చరిత్ర',
    profile: 'ప్రొఫైల్',
    positions: 'పొజిషన్లు',
    searchPlaceholder: 'పరికరాలను శోధించండి... ఉదా. NIFTY, GOLD, BTC',
    instruments: 'పరికరాలు',
    intraday: 'ఇంట్రాడే',
    holding: 'హోల్డింగ్',
    wallet: 'వాలెట్',
    logout: 'లాగౌట్',
    liveFeed: 'లైవ్ ఫీడ్',
    all: 'అన్నీ',
    crypto: 'క్రిప్టో',
    equity: 'ఈక్విటీ',
    forex: 'ఫారెక్స్',
    commodity: 'కమోడిటీ',
    index: 'ఇండెక్స్',
    buy: 'కొనుగోలు',
    sell: 'అమ్మకం',
    openPositions: 'ఓపెన్ పొజిషన్లు',
    active: 'యాక్టివ్',
    tradeMore: 'మరింత ట్రేడ్ చేయండి',
    totalUnrealizedPnl: 'మొత్తం అవాస్తవిక P&L',
    profit: 'లాభం (PROFIT)',
    loss: 'నష్టం (LOSS)',
    exitPosition: 'పొజిషన్ మూసివేయి',
    chart: 'చార్ట్',
  },
  ml: {
    availableMargin: 'ലഭ്യമായ മാർജിൻ',
    todayPnl: 'ഇന്നത്തെ P&L',
    overallPnl: 'ആകെ P&L',
    watchlist: 'വാച്ച്‌ലിസ്റ്റ്',
    orders: 'ഓർഡറുകൾ',
    portfolio: 'പോർട്ട്‌ഫോളിയോ',
    history: 'ചരിത്രം',
    profile: 'പ്രൊഫൈൽ',
    positions: 'പൊസിഷനുകൾ',
    searchPlaceholder: 'ഉപകരണങ്ങൾ തിരയുക... ഉദാ. NIFTY, GOLD, BTC',
    instruments: 'ഉപകരണങ്ങൾ',
    intraday: 'ഇൻട്രാഡേ',
    holding: 'ഹോൾഡിംഗ്',
    wallet: 'വാലറ്റ്',
    logout: 'ലോഗ്ഔട്ട്',
    liveFeed: 'തത്സമയ ഫീഡ്',
    all: 'എല്ലാം',
    crypto: 'ക്രിപ്റ്റോ',
    equity: 'ഇക്വിറ്റി',
    forex: 'ഫോറെക്സ്',
    commodity: 'കമ്മോഡിറ്റി',
    index: 'ഇൻഡെക്സ്',
    buy: 'വാങ്ങുക',
    sell: 'വിൽക്കുക',
    openPositions: 'തുറന്ന പൊസിഷനുകൾ',
    active: 'സജീവം',
    tradeMore: 'കൂടുതൽ ട്രേഡ് ചെയ്യുക',
    totalUnrealizedPnl: 'ആകെ യാഥാർത്ഥ്യമാകാത്ത P&L',
    profit: 'ലാഭം (PROFIT)',
    loss: 'നഷ്ടം (LOSS)',
    exitPosition: 'പൊസിഷൻ അവസാനിപ്പിക്കുക',
    chart: 'ചാർട്ട്',
  },
  mr: {
    availableMargin: 'उपलब्ध मार्जिन',
    todayPnl: 'आजचा P&L',
    overallPnl: 'एकूण P&L',
    watchlist: 'वॉचलिस्ट',
    orders: 'ऑर्डर्स',
    portfolio: 'पोर्टफोलिओ',
    history: 'इतिहास',
    profile: 'प्रोफाइल',
    positions: 'पोझिशन्स',
    searchPlaceholder: 'इन्स्ट्रुमेंट्स शोधा... उदा. NIFTY, GOLD, BTC',
    instruments: 'इन्स्ट्रुमेंट्स',
    intraday: 'इंट्राडे',
    holding: 'होल्डिंग',
    wallet: 'वॉलेट',
    logout: 'लॉगआउट',
    liveFeed: 'लाईव्ह फीड',
    all: 'सर्व',
    crypto: 'क्रिप्टो',
    equity: 'इक्विटी',
    forex: 'फॉरेक्स',
    commodity: 'कमोडिटी',
    index: 'इंडेक्स',
    buy: 'खरेदी',
    sell: 'विक्री',
    openPositions: 'ओपन पोझिशन्स',
    active: 'सक्रिय',
    tradeMore: 'अधिक ट्रेड करा',
    totalUnrealizedPnl: 'एकूण अवास्तविक P&L',
    profit: 'नफा (PROFIT)',
    loss: 'तोटा (LOSS)',
    exitPosition: 'पोझिशन बंद करा',
    chart: 'चार्ट',
  },
  ta: {
    availableMargin: 'கிடைக்கும் மார்ஜின்',
    todayPnl: 'இன்றைய P&L',
    overallPnl: 'மொத்த P&L',
    watchlist: 'கண்காணிப்புப் பட்டியல்',
    orders: 'ஆர்டர்கள்',
    portfolio: 'போர்ட்ஃபோலியோ',
    history: 'வரலாறு',
    profile: 'சுயவிவரம்',
    positions: 'நிலைகள்',
    searchPlaceholder: 'கருவிகளைத் தேடவும்... எ.கா. NIFTY, GOLD, BTC',
    instruments: 'கருவிகள்',
    intraday: 'இன்ட்ராடே',
    holding: 'ஹோல்டிங்',
    wallet: 'வாலட்',
    logout: 'வெளியேறு',
    liveFeed: 'நேரலை ஃபீட்',
    all: 'அனைத்தும்',
    crypto: 'கிரிப்டோ',
    equity: 'ஈக்விட்டி',
    forex: 'ஃபாரெக்ஸ்',
    commodity: 'பொருட்கள்',
    index: 'குறியீடு',
    buy: 'வாங்க',
    sell: 'விற்க',
    openPositions: 'திறந்த நிலைகள்',
    active: 'செயலில்',
    tradeMore: 'மேலும் வர்த்தகம்',
    totalUnrealizedPnl: 'மொத்த உணரப்படாத P&L',
    profit: 'லாபம் (PROFIT)',
    loss: 'இழப்பு (LOSS)',
    exitPosition: 'வெளியேறு',
    chart: 'விளக்கப்படம்',
  },
};

interface LanguageContextType {
  language: LanguageCode;
  currentLanguage: LanguageOption;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'trading_platform_language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'en';
  });

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const currentLanguage =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  const t = (key: string): string => {
    const langDict = TRANSLATIONS[language];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    // Fallback to English
    return TRANSLATIONS.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, currentLanguage, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
