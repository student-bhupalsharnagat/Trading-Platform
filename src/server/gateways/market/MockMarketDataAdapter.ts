/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Mock Market Data Adapter
 * Wraps existing realistic simulation instruments, quotes, candles, and real-time ticks.
 */

import { IMarketDataGateway } from './IMarketDataGateway.ts';
import { Instrument, Candle } from '../../../types.ts';
import { MarketQuote, MarketTick } from '../types.ts';
import { INSTRUMENTS, findInstrument, generateHistoricalCandles } from '../../trading/tradingStore.ts';

export class MockMarketDataAdapter implements IMarketDataGateway {
  public readonly providerId = 'mock-market-data';
  public readonly name = 'Mock Simulated Market Data Provider';

  private customQuotes = new Map<string, Partial<MarketQuote>>();
  private tickListeners = new Map<string, Set<(tick: MarketTick) => void>>();

  public async getInstruments(tenantId?: string): Promise<Instrument[]> {
    // Return all standard instruments, reflecting any dynamic price updates
    return INSTRUMENTS.map((inst) => {
      const custom = this.customQuotes.get(inst.symbol);
      if (custom && custom.lastPrice) {
        return {
          ...inst,
          lastPrice: custom.lastPrice,
          ask: custom.ask ?? custom.lastPrice + 1.0,
          bid: custom.bid ?? custom.lastPrice - 1.0,
        };
      }
      return { ...inst };
    });
  }

  public async getInstrument(symbol: string, tenantId?: string): Promise<Instrument | null> {
    const inst = findInstrument(symbol) || INSTRUMENTS.find((i) => i.symbol.toUpperCase() === symbol.toUpperCase());
    if (!inst) return null;

    const custom = this.customQuotes.get(inst.symbol);
    if (custom && custom.lastPrice) {
      return {
        ...inst,
        lastPrice: custom.lastPrice,
        ask: custom.ask ?? custom.lastPrice + 1.0,
        bid: custom.bid ?? custom.lastPrice - 1.0,
      };
    }
    return { ...inst };
  }

  public async getQuote(symbol: string, tenantId?: string): Promise<MarketQuote | null> {
    const inst = await this.getInstrument(symbol, tenantId);
    if (!inst) return null;

    const custom = this.customQuotes.get(inst.symbol);
    const lastPrice = custom?.lastPrice ?? inst.lastPrice;
    const bid = custom?.bid ?? inst.bid ?? lastPrice - 1.0;
    const ask = custom?.ask ?? inst.ask ?? lastPrice + 1.0;

    return {
      symbol: inst.symbol,
      lastPrice,
      bid,
      ask,
      open: inst.openPrice,
      high: inst.highPrice,
      low: inst.lowPrice,
      close: inst.prevClose,
      volume: 125000,
      change: inst.change,
      changePercent: inst.changePercent,
      timestamp: Date.now(),
    };
  }

  public async getQuotes(symbols: string[], tenantId?: string): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const sym of symbols) {
      const q = await this.getQuote(sym, tenantId);
      if (q) quotes.push(q);
    }
    return quotes;
  }

  public async getCandles(
    symbol: string,
    timeframe = '15m',
    count = 60,
    tenantId?: string
  ): Promise<Candle[]> {
    const inst = await this.getInstrument(symbol, tenantId);
    const basePrice = inst ? inst.lastPrice : 1000.0;
    const intervalMinutes = timeframe === '1h' ? 60 : timeframe === '1d' ? 1440 : 15;
    return generateHistoricalCandles(basePrice, count, intervalMinutes);
  }

  public generateTick(symbol: string, price?: number): MarketTick {
    const inst = findInstrument(symbol) || INSTRUMENTS[0];
    const base = price !== undefined ? price : (inst?.lastPrice || 100.0);
    const volatility = base * 0.0005;
    const delta = (Math.random() - 0.49) * volatility;
    const tickPrice = Number((base + delta).toFixed(2));

    const tick: MarketTick = {
      symbol: inst?.symbol || symbol,
      price: tickPrice,
      quantity: Math.floor(10 + Math.random() * 90),
      timestamp: Date.now(),
      tickType: delta >= 0 ? 'TRADE' : 'BID',
    };

    // Update in-memory quote
    this.customQuotes.set(tick.symbol, { lastPrice: tickPrice });

    // Notify active listeners (both by actual instrument symbol and queried symbol)
    const notified = new Set<(tick: MarketTick) => void>();
    const notifySet = (key: string) => {
      const listeners = this.tickListeners.get(key);
      if (listeners) {
        listeners.forEach((fn) => {
          if (!notified.has(fn)) {
            notified.add(fn);
            try {
              fn(tick);
            } catch {}
          }
        });
      }
    };

    notifySet(tick.symbol);
    notifySet(symbol);
    notifySet(tick.symbol.toUpperCase());
    notifySet(symbol.toUpperCase());

    return tick;
  }

  public subscribeTicks(symbol: string, listener: (tick: MarketTick) => void): () => void {
    const key = symbol;
    let set = this.tickListeners.get(key);
    if (!set) {
      set = new Set();
      this.tickListeners.set(key, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.tickListeners.delete(key);
      }
    };
  }

  public setCustomPrice(symbol: string, price: number): void {
    const inst = findInstrument(symbol);
    const sym = inst ? inst.symbol : symbol;
    this.customQuotes.set(sym, {
      lastPrice: price,
      ask: Number((price + 1.0).toFixed(2)),
      bid: Number((price - 1.0).toFixed(2)),
    });
  }

  public reset(): void {
    this.customQuotes.clear();
    this.tickListeners.clear();
  }
}

export const mockMarketDataAdapter = new MockMarketDataAdapter();
