export type OnboardingEmailKind = 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED' | 'DRAFT';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

export function onboardingEmailCopy(kind: OnboardingEmailKind) {
  const copy: Record<OnboardingEmailKind, { eyebrow: string; heading: string; intro: string; subject: string }> = {
    SUBMITTED: { eyebrow: 'ONBOARDING SUBMITTED', heading: 'A Voya vendor onboarding application needs review', intro: 'A vendor has submitted their onboarding application and it is ready for review.', subject: 'Voya vendor onboarding submitted for review' },
    UNDER_REVIEW: { eyebrow: 'ONBOARDING REVIEW', heading: 'Your Voya onboarding is under review', intro: 'The Voya team has started reviewing your vendor onboarding application.', subject: 'Your Voya onboarding is under review' },
    CHANGES_REQUESTED: { eyebrow: 'ACTION REQUIRED', heading: 'Changes are requested for your Voya onboarding', intro: 'The Voya team reviewed your application and needs you to update the requested details before submitting again.', subject: 'Changes requested for your Voya onboarding' },
    REJECTED: { eyebrow: 'ONBOARDING DECISION', heading: 'Your Voya onboarding was rejected', intro: 'The Voya team could not approve your vendor onboarding application at this time.', subject: 'Your Voya onboarding was rejected' },
    APPROVED: { eyebrow: 'ONBOARDING APPROVED', heading: 'Your Voya vendor account is approved', intro: 'Your onboarding application has been approved. You can now continue setting up your Voya catalogue.', subject: 'Your Voya vendor onboarding is approved' },
    DRAFT: { eyebrow: 'ONBOARDING UPDATE', heading: 'Your Voya onboarding was returned for updates', intro: 'Your onboarding application is available as a draft so you can make corrections and submit it again.', subject: 'Your Voya onboarding was returned for updates' },
  };
  return copy[kind];
}

export function renderVoyaOnboardingEmailHtml(input: { kind: OnboardingEmailKind; vendorName: string; status: string; reason?: string | null }) {
  const copy = onboardingEmailCopy(input.kind);
  const reason = input.reason?.trim();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><title>${escapeHtml(copy.heading)}</title></head>
<body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#162b50;">
  <div style="padding:32px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e4e1d9;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#111f3d;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:42px;height:42px;background:#efa832;border-radius:9px;text-align:center;vertical-align:middle;color:#111f3d;font-size:25px;">V</td><td style="padding-left:12px;vertical-align:middle;"><div style="font-size:23px;font-weight:800;color:#fff;">Voya</div><div style="margin-top:3px;font-size:11px;letter-spacing:1.8px;color:#aab8d0;">VENDOR CONSOLE</div></td></tr></table></td></tr>
    <tr><td style="height:6px;background:#efa832;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:34px 32px 28px;"><div style="font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#c88920;margin-bottom:12px;">${escapeHtml(copy.eyebrow)}</div><h1 style="margin:0 0 18px;color:#111f3d;font-size:28px;line-height:1.25;">${escapeHtml(copy.heading)}</h1><p style="margin:0 0 14px;color:#526886;font-size:15px;line-height:1.65;">Hello ${escapeHtml(input.vendorName)},</p><p style="margin:0;color:#526886;font-size:15px;line-height:1.65;">${escapeHtml(copy.intro)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 20px;border:1px solid #e6dfcf;border-radius:10px;background:#fffaf0;"><tr><td style="padding:18px 20px;"><div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6b7890;margin-bottom:7px;">Application status</div><div style="font-size:20px;font-weight:800;color:#111f3d;">${escapeHtml(input.status.replaceAll('_', ' '))}</div></td></tr></table>
    ${reason ? `<div style="margin:0 0 20px;padding:16px 18px;border-left:4px solid #d65b4b;background:#fff1ef;color:#526886;font-size:15px;line-height:1.6;"><strong style="color:#111f3d;">Reviewer note</strong><br>${escapeHtml(reason)}</div>` : ''}
    <p style="margin:0;color:#71809a;font-size:13px;line-height:1.6;">Please sign in to your Voya Vendor Console to view the latest application status and continue the onboarding process.</p></td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid #e8e5dd;background:#fbfaf7;color:#71809a;font-size:12px;line-height:1.55;"><strong style="color:#526886;">Voya Vendor Console</strong><br>This is an automated service message. Please do not reply to this email.</td></tr>
  </table></div>
</body></html>`;
}
