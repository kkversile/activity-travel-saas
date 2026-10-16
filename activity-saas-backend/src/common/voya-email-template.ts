import { EmailAuthChallengePurpose } from '@prisma/client';

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' })[character] ?? character);
}

export function renderVoyaVendorEmailCodeHtml(code: string, purpose: EmailAuthChallengePurpose) {
  const isPasswordReset = purpose === EmailAuthChallengePurpose.RESET_VENDOR_PASSWORD;
  const eyebrow = isPasswordReset ? 'PASSWORD RESET' : 'VENDOR ACCESS';
  const heading = isPasswordReset ? 'Reset your Voya vendor password' : 'Complete your Voya vendor access';
  const intro = isPasswordReset
    ? 'Use the verification code below to continue resetting your Voya vendor password.'
    : 'Use the verification code below to verify your email and continue to your Voya vendor console.';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#162b50;">
    <div style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e4e1d9;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:24px 32px;background:#111f3d;">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:42px;height:42px;background:#efa832;border-radius:9px;text-align:center;vertical-align:middle;color:#111f3d;font-size:25px;font-weight:400;">V</td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <div style="font-size:23px;font-weight:800;color:#ffffff;letter-spacing:.2px;">Voya</div>
                  <div style="margin-top:3px;font-size:11px;letter-spacing:1.8px;color:#aab8d0;">VENDOR CONSOLE</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="height:6px;background:#efa832;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:34px 32px 28px;">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#c88920;margin-bottom:12px;">${eyebrow}</div>
            <h1 style="margin:0 0 18px;color:#111f3d;font-size:28px;line-height:1.25;">${heading}</h1>
            <p style="margin:0 0 14px;color:#526886;font-size:15px;line-height:1.65;">Hello,</p>
            <p style="margin:0;color:#526886;font-size:15px;line-height:1.65;">${intro}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 20px;border:1px solid #e6dfcf;border-radius:10px;background:#fffaf0;">
              <tr>
                <td style="padding:20px;text-align:center;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b7890;margin-bottom:10px;">Your verification code</div>
                  <div style="font-size:32px;line-height:1.2;font-weight:800;letter-spacing:9px;color:#111f3d;padding-left:9px;">${escapeHtml(code)}</div>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 12px;color:#526886;font-size:15px;line-height:1.65;"><strong style="color:#111f3d;">This code expires in 10 minutes.</strong></p>
            <p style="margin:0;color:#71809a;font-size:13px;line-height:1.6;">If you did not request this email, you can safely ignore it. Never share this code with anyone.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e8e5dd;background:#fbfaf7;color:#71809a;font-size:12px;line-height:1.55;">
            <strong style="color:#526886;">Voya Vendor Console</strong><br>
            This is an automated service message. Please do not reply to this email.
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
}
