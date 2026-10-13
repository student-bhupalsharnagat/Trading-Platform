import type {
  IEmailOtpProvider,
  EmailOtpSendOptions,
  EmailOtpSendResult,
} from './IEmailOtpProvider.ts';

export class DevelopmentEmailOtpProvider implements IEmailOtpProvider {
  public readonly name = 'development-email';

  public isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  public async sendEmailOtp(options: EmailOtpSendOptions): Promise<EmailOtpSendResult> {
    // Safe dev log without leaking secrets
    console.log(`\n================== [VERTEX DEV EMAIL OTP DISPATCH] ==================`);
    console.log(`TO: ${options.email}`);
    console.log(`PURPOSE: ${options.purpose}`);
    console.log(`USER ID: ${options.userId}`);
    console.log(`TTL: ${options.ttlMinutes} minutes`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`DEV PREVIEW OTP: ${options.otp}`);
    }
    console.log(`====================================================================\n`);

    return {
      success: true,
      provider: this.name,
      messageId: `dev-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    };
  }
}
