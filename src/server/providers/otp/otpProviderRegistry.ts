import type { IOtpProvider, OtpSendOptions, OtpSendResult } from './IOtpProvider.ts';
import { TwilioOtpProvider } from './TwilioOtpProvider.ts';
import { HttpSmsGatewayProvider } from './HttpSmsGatewayProvider.ts';
import { DevelopmentOtpProvider } from './DevelopmentOtpProvider.ts';

export class OtpProviderRegistry {
  private providers: Map<string, IOtpProvider> = new Map();
  private primaryProviderName?: string;

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    const twilio = new TwilioOtpProvider();
    const http = new HttpSmsGatewayProvider();
    const dev = new DevelopmentOtpProvider();

    this.providers.set(twilio.name, twilio);
    this.providers.set(http.name, http);
    this.providers.set(dev.name, dev);
  }

  /**
   * Register a custom or replacement OTP provider without touching signup logic
   */
  public registerProvider(provider: IOtpProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Explicitly set the active primary provider name
   */
  public setPrimaryProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`OTP Provider "${name}" is not registered in registry.`);
    }
    this.primaryProviderName = name;
  }

  /**
   * Resolves the active provider according to environment variables and configuration
   */
  public getActiveProvider(): IOtpProvider {
    // 1. If explicitly set via setPrimaryProvider
    if (this.primaryProviderName && this.providers.has(this.primaryProviderName)) {
      const explicit = this.providers.get(this.primaryProviderName)!;
      // In production, prohibit development adapter
      if (process.env.NODE_ENV === 'production' && explicit.name === 'development') {
        throw new Error('CRITICAL: Development OTP Provider cannot be used in production.');
      }
      return explicit;
    }

    // 2. Explicit provider selection via OTP_PROVIDER environment variable
    const requestedProvider = process.env.OTP_PROVIDER?.toLowerCase().trim();
    if (requestedProvider && this.providers.has(requestedProvider)) {
      const provider = this.providers.get(requestedProvider)!;
      if (process.env.NODE_ENV === 'production' && provider.name === 'development') {
        throw new Error('CRITICAL: Development OTP Provider cannot be activated in production.');
      }
      return provider;
    }

    // 3. Auto-detect configured production providers
    const twilio = this.providers.get('twilio');
    if (twilio && twilio.isConfigured()) {
      return twilio;
    }

    const http = this.providers.get('http-gateway');
    if (http && http.isConfigured()) {
      return http;
    }

    // 4. In non-production environments, check development adapter
    if (process.env.NODE_ENV !== 'production') {
      const dev = this.providers.get('development');
      if (dev && dev.isConfigured()) {
        return dev;
      }
      // If no provider configured in non-production, return development adapter
      if (dev) {
        return dev;
      }
    }

    // In production with no configured provider, throw clear server configuration error
    throw new Error(
      'Production SMS OTP provider is not configured. Please set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN or SMS_GATEWAY_URL/SMS_GATEWAY_API_KEY.'
    );
  }

  /**
   * Dispatches OTP using the active provider with timeout and error protection
   */
  public async dispatchOtp(options: OtpSendOptions): Promise<OtpSendResult> {
    try {
      const provider = this.getActiveProvider();
      return await provider.sendOtp(options);
    } catch (err: any) {
      return {
        success: false,
        provider: this.primaryProviderName || 'unknown',
        error: err.message || 'OTP dispatch failed at provider level.',
      };
    }
  }
}

export const otpProviderRegistry = new OtpProviderRegistry();
