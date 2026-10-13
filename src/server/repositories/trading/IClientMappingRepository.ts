export interface ClientIdentityMapping {
  id: string;
  tenant_id: string;
  trading_user_id: string;
  external_client_id: string | null;
  external_client_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface IClientMappingRepository {
  createOrUpdate(
    tenantId: string,
    tradingUserId: string,
    externalClientId?: string | null,
    externalClientCode?: string | null
  ): Promise<ClientIdentityMapping>;
  findByTradingUserId(tenantId: string, tradingUserId: string): Promise<ClientIdentityMapping | null>;
  findByExternalClientId(tenantId: string, externalClientId: string): Promise<ClientIdentityMapping | null>;
  findByExternalClientCode(tenantId: string, externalClientCode: string): Promise<ClientIdentityMapping | null>;
  getAll(tenantId: string): Promise<ClientIdentityMapping[]>;
}
