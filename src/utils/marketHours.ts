export interface MarketHoursInfo {
  isOpen: boolean;
  exchange: string;
  tradingHours: string;
  days: string;
  timeZone: string;
  reason?: string;
}

export function getMarketHoursInfo(category: string = 'COMMODITY', overrideClosed?: boolean | null): MarketHoursInfo {
  // If user explicitly set simulation override
  if (overrideClosed === true) {
    return getExchangeSchedule(category, false, 'Manual / Off-Hours Simulation');
  }
  if (overrideClosed === false) {
    return getExchangeSchedule(category, true);
  }

  // Real-time IST calculation
  const now = new Date();
  // Get time in Indian Standard Time (UTC+5:30)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 3600000 * 5.5);

  const day = istTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const isWeekend = day === 0 || day === 6;

  if (category === 'CRYPTO') {
    return {
      isOpen: true,
      exchange: 'CRYPTO 24/7',
      tradingHours: '00:00 - 23:59',
      days: 'Mon - Sun',
      timeZone: 'IST',
    };
  }

  if (category === 'COMMODITY') {
    // MCX Commodity trading hours: 09:00 to 23:30 IST (Mon - Fri)
    const mcxOpen = 9 * 60; // 09:00
    const mcxClose = 23 * 60 + 30; // 23:30
    const isOpen = !isWeekend && currentMinutes >= mcxOpen && currentMinutes <= mcxClose;

    return {
      isOpen,
      exchange: 'MCX',
      tradingHours: '09:00 - 23:30',
      days: 'Mon - Fri',
      timeZone: 'IST',
      reason: isWeekend ? 'Weekend market closure' : 'Outside 09:00 - 23:30 IST',
    };
  }

  if (category === 'EQUITY' || category === 'INDEX') {
    // NSE / BSE trading hours: 09:15 to 15:30 IST (Mon - Fri)
    const nseOpen = 9 * 60 + 15; // 09:15
    const nseClose = 15 * 60 + 30; // 15:30
    const isOpen = !isWeekend && currentMinutes >= nseOpen && currentMinutes <= nseClose;

    return {
      isOpen,
      exchange: 'NSE / BSE',
      tradingHours: '09:15 - 15:30',
      days: 'Mon - Fri',
      timeZone: 'IST',
      reason: isWeekend ? 'Weekend market closure' : 'Outside 09:15 - 15:30 IST',
    };
  }

  if (category === 'FOREX') {
    // Forex 24/5 (Mon 00:00 to Fri 23:59)
    const isOpen = !isWeekend;
    return {
      isOpen,
      exchange: 'FOREX',
      tradingHours: '00:00 - 23:59',
      days: 'Mon - Fri',
      timeZone: 'IST',
      reason: isWeekend ? 'Weekend market closure' : undefined,
    };
  }

  // Default MCX
  return {
    isOpen: !isWeekend,
    exchange: 'MCX',
    tradingHours: '09:00 - 23:30',
    days: 'Mon - Fri',
    timeZone: 'IST',
  };
}

function getExchangeSchedule(category: string, isOpen: boolean, reason?: string): MarketHoursInfo {
  if (category === 'EQUITY' || category === 'INDEX') {
    return {
      isOpen,
      exchange: 'NSE',
      tradingHours: '09:15 - 15:30',
      days: 'Mon - Fri',
      timeZone: 'IST',
      reason,
    };
  }
  return {
    isOpen,
    exchange: 'MCX',
    tradingHours: '09:00 - 23:30',
    days: 'Mon - Fri',
    timeZone: 'IST',
    reason,
  };
}
