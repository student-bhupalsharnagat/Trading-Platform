export interface SyncedTenantConfig {
  tenantId: string;
  tenantStatus?: string;
  tradingEnabled?: boolean;
  registrationEnabled?: boolean;
  apiEnabled?: boolean;
  maintenanceMode?: boolean;
  optionsTradingEnabled?: boolean;
  maxLeverage?: number;
  brandingVersion?: number;
  configVersion: number;
  updatedAt: string;
}

export interface ITenantConfigStore {
  getConfig(tenantId: string): Promise<SyncedTenantConfig | null>;
  saveConfig(tenantId: string, config: Partial<SyncedTenantConfig>): Promise<SyncedTenantConfig>;
  getConfigVersion(tenantId: string): Promise<number>;
  getAllConfigs(): Promise<SyncedTenantConfig[]>;
}

export class MemoryTenantConfigStore implements ITenantConfigStore {
  private configs = new Map<string, SyncedTenantConfig>();

  public async getConfig(tenantId: string): Promise<SyncedTenantConfig | null> {
    return this.configs.get(tenantId) || null;
  }

  public async saveConfig(
    tenantId: string,
    updates: Partial<SyncedTenantConfig>
  ): Promise<SyncedTenantConfig> {
    const existing = this.configs.get(tenantId);
    const currentVersion = existing?.configVersion ?? 0;
    const nextVersion =
      typeof updates.configVersion === 'number' && updates.configVersion > 0
        ? updates.configVersion
        : currentVersion + 1;

    const merged: SyncedTenantConfig = {
      tenantId,
      tenantStatus: updates.tenantStatus ?? existing?.tenantStatus ?? 'active',
      tradingEnabled: updates.tradingEnabled ?? existing?.tradingEnabled ?? true,
      registrationEnabled: updates.registrationEnabled ?? existing?.registrationEnabled ?? true,
      apiEnabled: updates.apiEnabled ?? existing?.apiEnabled ?? true,
      maintenanceMode: updates.maintenanceMode ?? existing?.maintenanceMode ?? false,
      optionsTradingEnabled: updates.optionsTradingEnabled ?? existing?.optionsTradingEnabled ?? true,
      maxLeverage: updates.maxLeverage ?? existing?.maxLeverage ?? 50,
      brandingVersion: updates.brandingVersion ?? existing?.brandingVersion ?? 1,
      configVersion: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    this.configs.set(tenantId, merged);
    return merged;
  }

  public async getConfigVersion(tenantId: string): Promise<number> {
    const config = this.configs.get(tenantId);
    return config?.configVersion ?? 0;
  }

  public async getAllConfigs(): Promise<SyncedTenantConfig[]> {
    return Array.from(this.configs.values());
  }
}

export const tenantConfigStore: ITenantConfigStore = new MemoryTenantConfigStore();
