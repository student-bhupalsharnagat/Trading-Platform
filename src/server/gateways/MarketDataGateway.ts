/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Market Data Gateway Service
 */

import { IMarketDataGateway } from './market/IMarketDataGateway.ts';
import { mockMarketDataAdapter } from './market/MockMarketDataAdapter.ts';
import { Instrument, Candle } from '../../types.ts';
import { MarketQuote, MarketTick } from './types.ts';

export class MarketDataGateway {
  private adapter: IMarketDataGateway = mockMarketDataAdapter;

  public setAdapter(adapter: IMarketDataGateway): void {
    this.adapter = adapter;
  }

  public getAdapter(): IMarketDataGateway {
    return this.adapter;
  }

  public async getInstruments(tenantId?: string): Promise<Instrument[]> {
    return this.adapter.getInstruments(tenantId);
  }

  public async getInstrument(symbol: string, tenantId?: string): Promise<Instrument | null> {
    return this.adapter.getInstrument(symbol, tenantId);
  }

  public async getQuote(symbol: string, tenantId?: string): Promise<MarketQuote | null> {
    return this.adapter.getQuote(symbol, tenantId);
  }

  public async getQuotes(symbols: string[], tenantId?: string): Promise<MarketQuote[]> {
    return this.adapter.getQuotes(symbols, tenantId);
  }

  public async getCandles(
    symbol: string,
    timeframe = '15m',
    count = 60,
    tenantId?: string
  ): Promise<Candle[]> {
    return this.adapter.getCandles(symbol, timeframe, count, tenantId);
  }

  public generateTick(symbol: string, price?: number): MarketTick {
    return this.adapter.generateTick(symbol, price);
  }

  public subscribeTicks(symbol: string, listener: (tick: MarketTick) => void): () => void {
    return this.adapter.subscribeTicks(symbol, listener);
  }
}

export const marketDataGateway = new MarketDataGateway();
