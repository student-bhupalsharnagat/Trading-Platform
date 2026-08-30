export interface SmsPayload {
  countryCode: string;
  mobile: string;
  message: string;
}

class SmsService {
  public async sendOtpSms(
    countryCode: string,
    mobile: string,
    otp: string
  ): Promise<{ success: boolean; simulated: boolean }> {
    const fullNumber = `${countryCode}${mobile}`;
    const message = `[VERTEX] Your OTP verification code is ${otp}. Valid for 10 minutes. Do not share with anyone.`;

    // Extensible hook for Twilio / Fast2SMS / MSG91 / AWS SNS SMS provider
    console.log(`\n================== [VERTEX SMS DISPATCH] ==================`);
    console.log(`DESTINATION: ${fullNumber}`);
    console.log(`MESSAGE: ${message}`);
    console.log(`===========================================================\n`);

    return { success: true, simulated: true };
  }
}

export const smsService = new SmsService();
