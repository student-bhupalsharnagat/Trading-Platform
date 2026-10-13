import type { IOtpProvider, OtpSendOptions, OtpSendResult } from './IOtpProvider.ts';

/**
 * Development OTP Adapter
 * STRICT SECURITY INVARIANTS:
 * 1. MUST NEVER activate automatically in production (process.env.NODE_ENV === 'production').
 * 2. Throws a fatal security exception if invoked in production mode.
 * 3. Never logs plaintext OTP in production.
 */
export class DevelopmentOtpProvider implements IOtpProvider {
  public readonly name = 'development';

  public isConfigured(): boolean {
    // Strictly forbidden in production
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    // Disabled if explicitly set to false
    if (process.env.ENABLE_DEV_OTP === 'false') {
      return false;
    }
    return true;
  }

  public async sendOtp(options: OtpSendOptions): Promise<OtpSendResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: DevelopmentOtpProvider cannot be executed in production environment.'
      );
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        error: 'Development OTP provider is disabled. Set ENABLE_DEV_OTP=true in development.',
      };
    }

    return {
      success: true,
      messageId: `dev-msg-${Date.now()}`,
      provider: this.name,
    };
  }
}
