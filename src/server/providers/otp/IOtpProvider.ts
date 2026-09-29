/**
 * OTP Provider Interface
 * Defines standard contract for SMS/WhatsApp/Voice OTP dispatch providers.
 */

export interface OtpSendOptions {
  /** Destination phone number in international E.164 format (+[country][national]) */
  phoneE164: string;
  /** Generated numeric OTP code */
  otp: string;
  /** Purpose of verification */
  purpose: 'registration' | 'login' | 'password_reset';
  /** Normalized User ID */
  userId: string;
  /** Time to live in minutes */
  ttlMinutes: number;
}

export interface OtpSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface IOtpProvider {
  readonly name: string;
  /**
   * Sends the OTP to the recipient.
   * Must handle transport-level timeouts and failures.
   */
  sendOtp(options: OtpSendOptions): Promise<OtpSendResult>;
  /**
   * Checks if required credentials and configurations exist.
   */
  isConfigured(): boolean;
}
