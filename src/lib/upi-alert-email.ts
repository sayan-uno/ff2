'use server';

import nodemailer from 'nodemailer';

const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_APP_PASSWORD;

// Create a dedicated transporter for UPI alerts
// This is separate from the main email.ts to avoid modifying existing code
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser,
    pass: gmailPass,
  },
});

/**
 * Masks a UPI ID for display in emails, e.g., "ffgarenasmaxsayan@yesg" -> "ffga***@yesg"
 */
function maskUpiId(upiId: string): string {
  const parts = upiId.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const provider = parts[1];
  const visibleChars = Math.min(4, name.length);
  return `${name.substring(0, visibleChars)}***@${provider}`;
}

interface UpiChangeAlertDetails {
  oldUpiId: string;
  newUpiId: string;
}

/**
 * Sends a HIGH ALERT security email when the UPI ID is changed.
 * 
 * CRITICAL: This function is designed to THROW on failure.
 * The caller MUST NOT catch the error silently — if this email fails,
 * the UPI change MUST be blocked to ensure the admin is always notified.
 */
export async function sendUpiChangeAlert(details: UpiChangeAlertDetails): Promise<void> {
  if (!gmailUser || !gmailPass) {
    throw new Error(
      'SECURITY BLOCK: Email credentials are not configured. UPI change cannot proceed without email alerts. ' +
      'Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.'
    );
  }

  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const maskedOldUpi = maskUpiId(details.oldUpiId);

  const mailOptions = {
    from: `"Garena Gears - SECURITY ALERT" <${gmailUser}>`,
    to: gmailUser,
    subject: `🚨 HIGH ALERT: UPI ID Changed - Immediate Action Required`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🚨 HIGH SECURITY ALERT</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px;">UPI Payment ID Has Been Changed</p>
        </div>
        
        <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <div style="background-color: white; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Previous UPI ID:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 14px; color: #dc2626; text-decoration: line-through;">${maskedOldUpi}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">New UPI ID:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 16px; color: #16a34a;">${details.newUpiId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Changed At:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${timestamp} (IST)</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Changed By:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">Admin Panel</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fef9c3; border: 1px solid #eab308; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 14px; color: #854d0e;">
              <strong>⚠️ WARNING:</strong> If you did NOT make this change, your admin panel may be compromised. 
              Take immediate action:
            </p>
            <ol style="margin: 8px 0 0 0; padding-left: 20px; color: #854d0e; font-size: 13px;">
              <li>Change your admin password immediately</li>
              <li>Check your admin session/login history</li>
              <li>Revert the UPI ID from the admin panel</li>
              <li>Contact your hosting provider if needed</li>
            </ol>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 12px; margin: 0;">
            This is an automated security alert from Garena Gears Admin System.
            <br/>This email cannot be disabled or suppressed.
          </p>
        </div>
      </div>
    `,
  };

  // This MUST throw on failure — do NOT catch the error
  await transporter.sendMail(mailOptions);
  console.log(`[SECURITY] UPI change alert email sent successfully. Old: ${maskedOldUpi}, New: ${details.newUpiId}`);
}
