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

  // 24/7 demo/live execution enabled across all instruments so "Market: LIVE (IST)" and order placement always agree
  const exchangeName =
    category === 'EQUITY' || category === 'INDEX'
      ? 'NSE / BSE'
      : category === 'COMMODITY'
      ? 'MCX'
      : category === 'CRYPTO'
      ? 'CRYPTO 24/7'
      : 'FOREX';

  return {
    isOpen: true,
    exchange: exchangeName,
    tradingHours: '00:00 - 23:59 (24/7 Live Demo)',
    days: 'Mon - Sun',
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
