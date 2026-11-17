/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Market Data Gateway Service
 */

import { IMarketDataGateway } from './market/IMarketDataGateway.ts';
import { mockMarketDataAdapter } from './market/MockMarketDataAdapter.ts';
import { Instrument, Candle } from '../../types.ts';
import { MarketQuote, MarketTick } from './types.ts';
import { DEFAULT_INSTRUMENTS } from '../../data/defaultInstruments.ts';

export interface LivePrice {
  symbol: string;
  ltp: number;
  bid: number;
  ask: number;
  change: number;
  changePercent: number;
  timestamp?: number;
}

export class MarketDataGateway {
  private adapter: IMarketDataGateway = mockMarketDataAdapter;
  private livePriceMap = new Map<string, LivePrice>();

  constructor() {
    this.initDefaultPrices();
  }

  private initDefaultPrices(): void {
    try {
      DEFAULT_INSTRUMENTS.forEach((inst) => {
        this.updatePrice(inst.symbol, {
          symbol: inst.symbol,
          ltp: inst.lastPrice,
          bid: inst.bid ?? inst.lastPrice - 1.0,
          ask: inst.ask ?? inst.lastPrice + 1.0,
          change: inst.change ?? 0,
          changePercent: inst.changePercent ?? 0,
          timestamp: Date.now(),
        });
      });
    } catch {}
  }

  public updatePrice(symbol: string, tick: Partial<LivePrice> & { ltp?: number; lastPrice?: number }): void {
    const sym = symbol.toUpperCase();
    const existing = this.livePriceMap.get(sym);
    const ltp = tick.ltp ?? tick.lastPrice ?? existing?.ltp ?? 100;
    const bid = tick.bid ?? existing?.bid ?? (ltp - 1.0);
    const ask = tick.ask ?? existing?.ask ?? (ltp + 1.0);
    const change = tick.change ?? existing?.change ?? 0;
    const changePercent = tick.changePercent ?? existing?.changePercent ?? 0;

    const updated: LivePrice = {
      symbol: sym,
      ltp: Number(ltp.toFixed(2)),
      bid: Number(bid.toFixed(2)),
      ask: Number(ask.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      timestamp: tick.timestamp || Date.now(),
    };

    this.livePriceMap.set(sym, updated);
  }

  public getPrice(symbol: string): LivePrice | undefined {
    return this.livePriceMap.get(symbol.toUpperCase());
  }

  public getLtp(symbol: string): number | undefined {
    return this.livePriceMap.get(symbol.toUpperCase())?.ltp;
  }

  public getAllPrices(): Map<string, LivePrice> {
    return this.livePriceMap;
  }

  public getLivePriceSnapshot(): Record<string, LivePrice> {
    const result: Record<string, LivePrice> = {};
    for (const [k, v] of this.livePriceMap.entries()) {
      result[k] = v;
    }
    return result;
  }

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
