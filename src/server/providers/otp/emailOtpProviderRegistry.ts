import type {
  IEmailOtpProvider,
  EmailOtpSendOptions,
  EmailOtpSendResult,
} from './IEmailOtpProvider.ts';
import { ResendEmailOtpProvider } from './ResendEmailOtpProvider.ts';
import { DevelopmentEmailOtpProvider } from './DevelopmentEmailOtpProvider.ts';

export class EmailOtpProviderRegistry {
  private providers: Map<string, IEmailOtpProvider> = new Map();
  private primaryProviderName?: string;

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    const resend = new ResendEmailOtpProvider();
    const dev = new DevelopmentEmailOtpProvider();

    this.providers.set(resend.name, resend);
    this.providers.set(dev.name, dev);
  }

  /**
   * Register a custom or replacement Email OTP provider
   */
  public registerProvider(provider: IEmailOtpProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Set the active primary provider name
   */
  public setPrimaryProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Email OTP Provider "${name}" is not registered.`);
    }
    this.primaryProviderName = name;
  }

  /**
   * Resolves active email OTP provider according to environment configuration
   */
  public getActiveProvider(): IEmailOtpProvider {
    // 1. Explicit primary provider
    if (this.primaryProviderName && this.providers.has(this.primaryProviderName)) {
      const explicit = this.providers.get(this.primaryProviderName)!;
      if (process.env.NODE_ENV === 'production' && explicit.name === 'development-email') {
        throw new Error('CRITICAL: Development Email OTP Provider cannot be used in production.');
      }
      return explicit;
    }

    // 2. Environment override
    const requestedProvider = process.env.EMAIL_OTP_PROVIDER?.toLowerCase().trim();
    if (requestedProvider && this.providers.has(requestedProvider)) {
      const provider = this.providers.get(requestedProvider)!;
      if (process.env.NODE_ENV === 'production' && provider.name === 'development-email') {
        throw new Error('CRITICAL: Development Email OTP Provider cannot be activated in production.');
      }
      return provider;
    }

    // 3. Auto-detect Resend provider
    const resend = this.providers.get('resend');
    if (resend && resend.isConfigured()) {
      return resend;
    }

    // 4. In non-production, check development provider
    if (process.env.NODE_ENV !== 'production') {
      const dev = this.providers.get('development-email');
      if (dev) {
        return dev;
      }
    }

    // Default fallback in production if RESEND_API_KEY is unset
    if (resend) {
      return resend;
    }

    throw new Error('No Email OTP provider configured. Set RESEND_API_KEY environment variable.');
  }

  /**
   * Dispatches Email OTP using active provider
   */
  public async dispatchEmailOtp(options: EmailOtpSendOptions): Promise<EmailOtpSendResult> {
    try {
      const provider = this.getActiveProvider();
      return await provider.sendEmailOtp(options);
    } catch (err: any) {
      return {
        success: false,
        provider: 'registry',
        error: err?.message || 'Failed to resolve active Email OTP provider.',
      };
    }
  }
}

export const emailOtpProviderRegistry = new EmailOtpProviderRegistry();
