import type { IOtpProvider, OtpSendOptions, OtpSendResult } from './IOtpProvider.ts';

/**
 * Production Enterprise HTTP SMS Gateway Provider
 * Dispatches OTP over HTTPS POST to any standard SMS gateway (e.g. Sinch, MSG91, Infobip, Fast2SMS)
 * Server-only environment variables:
 * - SMS_GATEWAY_URL
 * - SMS_GATEWAY_API_KEY
 * - SMS_GATEWAY_SENDER_ID (optional)
 */
export class HttpSmsGatewayProvider implements IOtpProvider {
  public readonly name = 'http-gateway';
  private timeoutMs: number;

  constructor(timeoutMs = 8000) {
    this.timeoutMs = timeoutMs;
  }

  public isConfigured(): boolean {
    const url = process.env.SMS_GATEWAY_URL;
    const apiKey = process.env.SMS_GATEWAY_API_KEY;
    return Boolean(url && apiKey);
  }

  public async sendOtp(options: OtpSendOptions): Promise<OtpSendResult> {
    const url = process.env.SMS_GATEWAY_URL;
    const apiKey = process.env.SMS_GATEWAY_API_KEY;
    const senderId = process.env.SMS_GATEWAY_SENDER_ID || 'VERTEX';

    if (!url || !apiKey) {
      return {
        success: false,
        provider: this.name,
        error: 'HTTP SMS Gateway URL or API key is not configured.',
      };
    }

    const message = `[VERTEX] Your OTP verification code is ${options.otp}. Valid for ${options.ttlMinutes} minutes. Do not share with anyone.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          to: options.phoneE164,
          sender: senderId,
          message,
          purpose: options.purpose,
          referenceId: options.userId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          error: `SMS Gateway returned HTTP ${response.status}`,
        };
      }

      let responseData: any = {};
      try {
        responseData = await response.json();
      } catch {
        // text response
      }

      return {
        success: true,
        messageId: responseData?.messageId || responseData?.id || `msg-${Date.now()}`,
        provider: this.name,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      return {
        success: false,
        provider: this.name,
        error: isTimeout ? 'SMS Gateway request timed out.' : 'Failed to reach SMS Gateway server.',
      };
    }
  }
}
