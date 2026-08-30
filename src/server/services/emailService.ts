import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.isConfigured = true;
        console.log('[EmailService] SMTP transporter configured successfully for host:', host);
      } catch (err) {
        console.error('[EmailService] Failed to initialize SMTP transporter:', err);
      }
    } else {
      console.log(
        '[EmailService] SMTP not fully configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD). Falling back to development log delivery.'
      );
    }
  }

  public async sendEmail(options: EmailOptions): Promise<{ success: boolean; simulated?: boolean }> {
    const from = process.env.SMTP_FROM || 'VERTEX Security <security@vertex-trading.com>';

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        return { success: true, simulated: false };
      } catch (err) {
        console.error('[EmailService] SMTP send error:', err);
        return { success: false, simulated: false };
      }
    }

    // Dev/Local fallback: Log OTP delivery safely
    console.log(`\n================== [VERTEX DEV EMAIL DISPATCH] ==================`);
    console.log(`TO: ${options.to}`);
    console.log(`SUBJECT: ${options.subject}`);
    console.log(`TEXT:\n${options.text}`);
    console.log(`=================================================================\n`);
    return { success: true, simulated: true };
  }

  public async sendOtpEmail(to: string, otp: string, purpose: string): Promise<boolean> {
    const title =
      purpose === 'password_reset'
        ? 'VERTEX - Password Reset Verification Code'
        : 'VERTEX - Mobile & Account Verification Code';

    const text = `Your VERTEX verification code is: ${otp}. It will expire in 10 minutes. Do not share this code with anyone.`;

    const html = `
      <div style="background-color: #060B13; color: #f8fafc; font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 40px 20px; text-align: center;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #0B111C; border: 1px solid #1E293B; border-radius: 12px; padding: 32px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 10px; background-color: #162032; border: 1px solid #FF7A00; color: #FF7A00; font-size: 22px; margin-bottom: 16px;">
            &#9670;
          </div>
          <h1 style="color: #FF7A00; font-size: 24px; letter-spacing: 2px; margin: 0 0 6px 0; font-weight: 800;">VERTEX</h1>
          <p style="color: #8A99AD; font-style: italic; font-size: 13px; margin: 0 0 24px 0;">Trade smarter. Move faster.</p>
          <div style="height: 1px; background: #1E293B; margin: 20px 0;"></div>
          <p style="color: #94A3B8; font-size: 15px; margin-bottom: 20px;">Use the 6-digit verification code below to verify your request:</p>
          <div style="background-color: #060B13; border: 1px solid #FF7A00; border-radius: 8px; padding: 18px; display: inline-block; letter-spacing: 12px; font-size: 32px; font-weight: 700; color: #FF7A00; font-family: monospace; margin-bottom: 24px;">
            ${otp}
          </div>
          <p style="color: #64748B; font-size: 13px; margin: 0;">This code will expire in <strong>10 minutes</strong>. If you did not request this code, please ignore this email or contact support.</p>
        </div>
      </div>
    `;

    const res = await this.sendEmail({ to, subject: title, text, html });
    return res.success;
  }
}

export const emailService = new EmailService();
