/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Broker Adapter Contract Interface
 */

import {
  GatewayPlaceOrderRequest,
  GatewayCancelOrderRequest,
  GatewayModifyOrderRequest,
  GatewayOrderStatusRequest,
  GatewayOrderResult,
  NormalizedOrderState,
  ProviderContext,
} from '../types.ts';

export interface IBrokerAdapter {
  readonly providerId: string;
  readonly name: string;

  /**
   * Place an order with the external or simulated broker.
   */
  placeOrder(req: GatewayPlaceOrderRequest, context: ProviderContext): Promise<GatewayOrderResult>;

  /**
   * Cancel an existing order with the broker.
   */
  cancelOrder(req: GatewayCancelOrderRequest, context: ProviderContext): Promise<GatewayOrderResult>;

  /**
   * Modify price or quantity of an open order with the broker.
   */
  modifyOrder(req: GatewayModifyOrderRequest, context: ProviderContext): Promise<GatewayOrderResult>;

  /**
   * Fetch latest status and fill information from the broker.
   */
  getOrderStatus(req: GatewayOrderStatusRequest, context: ProviderContext): Promise<GatewayOrderResult>;

  /**
   * Map broker-specific raw status strings into internal NormalizedOrderState.
   */
  mapProviderStatus(rawStatus: string): NormalizedOrderState;

  /**
   * Authenticate and verify connectivity with broker sandbox.
   */
  authenticate?(context: ProviderContext): Promise<{
    authenticated: boolean;
    accountId?: string;
    mode?: string;
    details?: any;
  }>;

  /**
   * Query all active open orders currently working on the broker.
   */
  getOpenOrders?(context: ProviderContext): Promise<GatewayOrderResult[]>;

  /**
   * Query open positions from the broker.
   */
  getPositions?(context: ProviderContext): Promise<Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
  }>>;
}
