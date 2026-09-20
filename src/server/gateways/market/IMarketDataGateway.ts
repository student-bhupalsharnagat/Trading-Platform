/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Market Data Gateway & Adapter Interface
 */

import { Instrument, Candle } from '../../../types.ts';
import { MarketQuote, MarketTick } from '../types.ts';

export interface IMarketDataGateway {
  readonly providerId: string;
  readonly name: string;

  /**
   * List tradeable instruments.
   */
  getInstruments(tenantId?: string): Promise<Instrument[]>;

  /**
   * Fetch single instrument details.
   */
  getInstrument(symbol: string, tenantId?: string): Promise<Instrument | null>;

  /**
   * Fetch live quote for a specific instrument.
   */
  getQuote(symbol: string, tenantId?: string): Promise<MarketQuote | null>;

  /**
   * Fetch live quotes in batch.
   */
  getQuotes(symbols: string[], tenantId?: string): Promise<MarketQuote[]>;

  /**
   * Fetch historical candlestick data.
   */
  getCandles(symbol: string, timeframe?: string, count?: number, tenantId?: string): Promise<Candle[]>;

  /**
   * Generate or emit a market tick.
   */
  generateTick(symbol: string, price?: number): MarketTick;

  /**
   * Subscribe to real-time tick updates.
   */
  subscribeTicks(symbol: string, listener: (tick: MarketTick) => void): () => void;
}
