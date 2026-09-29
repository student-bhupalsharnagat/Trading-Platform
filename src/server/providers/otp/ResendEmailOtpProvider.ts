import type {
  IEmailOtpProvider,
  EmailOtpSendOptions,
  EmailOtpSendResult,
} from './IEmailOtpProvider.ts';

export class ResendEmailOtpProvider implements IEmailOtpProvider {
  public readonly name = 'resend';

  /**
   * Reads credentials exclusively from server-side environment variables
   */
  public isConfigured(): boolean {
    const apiKey = process.env.RESEND_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
  }

  public async sendEmailOtp(options: EmailOtpSendOptions): Promise<EmailOtpSendResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const fromAddress =
      process.env.EMAIL_FROM?.trim() ||
      'VERTEX Trading <security@vertex-trading.com>';

    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        error: 'Email verification service is not configured (missing RESEND_API_KEY).',
      };
    }

    const title =
      options.purpose === 'password_reset'
        ? 'VERTEX - Password Reset Verification Code'
        : 'VERTEX - Email Account Verification Code';

    const text = `Your VERTEX verification code is: ${options.otp}. It will expire in ${options.ttlMinutes} minutes. Do not share this code with anyone.`;

    const html = `
      <div style="background-color: #060B13; color: #f8fafc; font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 40px 20px; text-align: center;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #0B111C; border: 1px solid #1E293B; border-radius: 12px; padding: 32px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 10px; background-color: #162032; border: 1px solid #FF7A00; color: #FF7A00; font-size: 22px; margin-bottom: 16px;">
            &#9670;
          </div>
          <h1 style="color: #FF7A00; font-size: 24px; letter-spacing: 2px; margin: 0 0 6px 0; font-weight: 800;">VERTEX</h1>
          <p style="color: #8A99AD; font-style: italic; font-size: 13px; margin: 0 0 24px 0;">Trade smarter. Move faster.</p>
          <div style="height: 1px; background: #1E293B; margin: 20px 0;"></div>
          <p style="color: #94A3B8; font-size: 15px; margin-bottom: 20px;">Use the 6-digit verification code below to verify your email address:</p>
          <div style="background-color: #060B13; border: 1px solid #FF7A00; border-radius: 8px; padding: 18px; display: inline-block; letter-spacing: 12px; font-size: 32px; font-weight: 700; color: #FF7A00; font-family: monospace; margin-bottom: 24px;">
            ${options.otp}
          </div>
          <p style="color: #64748B; font-size: 13px; margin: 0;">This code will expire in <strong>${options.ttlMinutes} minutes</strong>. If you did not request this code, please ignore this email or contact support.</p>
        </div>
      </div>
    `;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [options.email],
          subject: title,
          text,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as any)?.message ||
          (errorData as any)?.error?.message ||
          `HTTP ${response.status} ${response.statusText}`;

        return {
          success: false,
          provider: this.name,
          error: `Resend API dispatch failed: ${errorMessage}`,
        };
      }

      const resData = (await response.json().catch(() => ({}))) as any;

      return {
        success: true,
        provider: this.name,
        messageId: resData?.id,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Network error while connecting to Resend API.',
      };
    }
  }
}
