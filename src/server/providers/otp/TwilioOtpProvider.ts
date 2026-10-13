import type { IOtpProvider, OtpSendOptions, OtpSendResult } from './IOtpProvider.ts';

/**
 * Production Twilio SMS Provider
 * Uses server-only credentials:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_FROM_PHONE (or TWILIO_MESSAGING_SERVICE_SID)
 */
export class TwilioOtpProvider implements IOtpProvider {
  public readonly name = 'twilio';
  private timeoutMs: number;

  constructor(timeoutMs = 8000) {
    this.timeoutMs = timeoutMs;
  }

  public isConfigured(): boolean {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_FROM_PHONE || process.env.TWILIO_MESSAGING_SERVICE_SID;
    return Boolean(accountSid && authToken && fromPhone);
  }

  public async sendOtp(options: OtpSendOptions): Promise<OtpSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_FROM_PHONE;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken || (!fromPhone && !messagingServiceSid)) {
      return {
        success: false,
        provider: this.name,
        error: 'Twilio SMS credentials are not configured.',
      };
    }

    const messageBody = `[VERTEX] Your verification code is ${options.otp}. Valid for ${options.ttlMinutes} minutes. Do not share this code.`;

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('To', options.phoneE164);
    params.append('Body', messageBody);

    if (messagingServiceSid) {
      params.append('MessagingServiceSid', messagingServiceSid);
    } else if (fromPhone) {
      params.append('From', fromPhone);
    }

    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as any;

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          error: data.message || `Twilio dispatch failed with HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        messageId: data.sid,
        provider: this.name,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      return {
        success: false,
        provider: this.name,
        error: isTimeout ? 'SMS provider request timed out.' : 'Failed to connect to SMS gateway.',
      };
    }
  }
}
