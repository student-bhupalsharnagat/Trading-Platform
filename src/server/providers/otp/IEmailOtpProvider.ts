/**
 * Email OTP Provider Interface
 * Defines standard contract for Email OTP dispatch providers.
 */

export interface EmailOtpSendOptions {
  /** Target normalized recipient email address */
  email: string;
  /** Cryptographically generated numeric OTP code */
  otp: string;
  /** Purpose of verification */
  purpose: 'registration' | 'login' | 'password_reset';
  /** Normalized User ID */
  userId: string;
  /** Time to live in minutes */
  ttlMinutes: number;
}

export interface EmailOtpSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface IEmailOtpProvider {
  readonly name: string;
  /**
   * Sends the Email OTP to the recipient.
   * Handles transport-level failures and rate limits.
   */
  sendEmailOtp(options: EmailOtpSendOptions): Promise<EmailOtpSendResult>;
  /**
   * Checks if required credentials and environment configurations exist.
   */
  isConfigured(): boolean;
}
