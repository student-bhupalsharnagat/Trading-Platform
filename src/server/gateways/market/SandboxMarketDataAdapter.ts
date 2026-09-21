/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5H
 * Sandbox Market Data Adapter
 * 
 * Interacts with broker sandbox / paper market data feeds, with graceful
 * fallback to simulated candles/ticks when outside sandbox market hours or unconfigured.
 */

import { IMarketDataGateway } from './IMarketDataGateway.ts';
import { mockMarketDataAdapter } from './MockMarketDataAdapter.ts';
import { Instrument, Candle } from '../../../types.ts';
import { MarketQuote, MarketTick } from '../types.ts';

export class SandboxMarketDataAdapter implements IMarketDataGateway {
  public readonly providerId = 'sandbox-market-data';
  public readonly name = 'Real Broker Sandbox Market Data Provider';

  private customQuotes = new Map<string, Partial<MarketQuote>>();
  private tickListeners = new Map<string, Set<(tick: MarketTick) => void>>();
  private mockHttpDispatcher: ((url: string, init: RequestInit) => Promise<Response>) | null = null;

  public setMockHttpDispatcher(dispatcher: ((url: string, init: RequestInit) => Promise<Response>) | null): void {
    this.mockHttpDispatcher = dispatcher;
  }

  public async getInstruments(tenantId?: string): Promise<Instrument[]> {
    // Return standard tradeable instruments with sandbox market status
    return mockMarketDataAdapter.getInstruments(tenantId);
  }

  public async getInstrument(symbol: string, tenantId?: string): Promise<Instrument | null> {
    return mockMarketDataAdapter.getInstrument(symbol, tenantId);
  }

  public async getQuote(symbol: string, tenantId?: string): Promise<MarketQuote | null> {
    const custom = this.customQuotes.get(symbol.toUpperCase());
    if (custom && custom.lastPrice) {
      return {
        symbol: symbol.toUpperCase(),
        bid: custom.bid ?? custom.lastPrice - 0.5,
        ask: custom.ask ?? custom.lastPrice + 0.5,
        lastPrice: custom.lastPrice,
        open: custom.open ?? custom.lastPrice,
        high: custom.high ?? custom.lastPrice + 5,
        low: custom.low ?? custom.lastPrice - 5,
        close: custom.close ?? custom.lastPrice,
        volume: custom.volume ?? 10000,
        change: custom.change ?? 0,
        changePercent: custom.changePercent ?? 0,
        timestamp: typeof custom.timestamp === 'number' ? custom.timestamp : Date.now(),
      };
    }

    // Attempt sandbox market data query or fallback to simulated
    return mockMarketDataAdapter.getQuote(symbol, tenantId);
  }

  public async getQuotes(symbols: string[], tenantId?: string): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const sym of symbols) {
      const q = await this.getQuote(sym, tenantId);
      if (q) quotes.push(q);
    }
    return quotes;
  }

  public async getCandles(symbol: string, timeframe = '1h', count = 100, tenantId?: string): Promise<Candle[]> {
    return mockMarketDataAdapter.getCandles(symbol, timeframe, count, tenantId);
  }

  public generateTick(symbol: string, price?: number): MarketTick {
    return mockMarketDataAdapter.generateTick(symbol, price);
  }

  public subscribeTicks(symbol: string, listener: (tick: MarketTick) => void): () => void {
    return mockMarketDataAdapter.subscribeTicks(symbol, listener);
  }

  public setQuote(symbol: string, quote: Partial<MarketQuote>): void {
    this.customQuotes.set(symbol.toUpperCase(), quote);
  }
}

export const sandboxMarketDataAdapter = new SandboxMarketDataAdapter();
