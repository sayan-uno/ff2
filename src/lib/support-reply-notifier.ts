import { type MongoDbWithClient } from '@/lib/mongodb';
import type { Notification, User } from '@/lib/definitions';
import { sendPushNotification } from '@/lib/push-notifications';

// Escape dynamic text (the report subject) before placing it into the HTML body
// so a subject can never break the markup.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Build a compact, self-contained animated "support reply" card for the
// notification bell. Everything (layout, colours, animation keyframes) is inlined
// so it renders identically in light/dark themes and needs no app CSS. Class names
// + keyframes are prefixed `srn-` so they cannot collide with anything else.
function buildSupportReplyHtml(subject: string, supportUrl: string): string {
  return `<div class="srn-card">
    <style>
      .srn-card{position:relative;overflow:hidden;border-radius:14px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#0e7490 100%);
        color:#eff6ff;font-family:ui-sans-serif,system-ui,sans-serif;
        box-shadow:0 8px 24px -8px rgba(37,99,235,.55);}
      .srn-card *{box-sizing:border-box;}
      .srn-glow{position:absolute;top:-40px;right:-40px;width:140px;height:140px;border-radius:50%;
        background:radial-gradient(circle,rgba(59,130,246,.55),transparent 70%);
        animation:srn-float 4s ease-in-out infinite;pointer-events:none;}
      .srn-head{display:flex;align-items:center;gap:10px;position:relative;z-index:1;}
      .srn-badge{flex:none;width:38px;height:38px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:19px;
        background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.6);
        animation:srn-pop .5s cubic-bezier(.18,.89,.32,1.28) both,srn-ring 2.2s ease-out .5s infinite;}
      .srn-title{font-size:15px;font-weight:700;line-height:1.2;}
      .srn-sub{font-size:11.5px;opacity:.85;margin-top:1px;}
      .srn-subject{margin:12px 0 12px;display:flex;align-items:center;gap:8px;font-size:12.5px;
        background:rgba(255,255,255,.12);border-radius:8px;padding:8px 10px;position:relative;z-index:1;
        animation:srn-rise .5s ease both .15s;}
      .srn-subject .srn-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#bfdbfe;}
      .srn-subject b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:#fff;}
      .srn-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
        text-decoration:none;font-size:13.5px;font-weight:700;color:#1d4ed8 !important;
        background:#fff;border-radius:10px;padding:10px 14px;position:relative;overflow:hidden;z-index:1;
        box-shadow:0 4px 14px -4px rgba(0,0,0,.35);}
      .srn-btn::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
        background:linear-gradient(120deg,transparent,rgba(255,255,255,.7),transparent);
        transform:skewX(-20deg);animation:srn-shine 2.6s ease-in-out infinite;}
      @keyframes srn-pop{0%{transform:scale(0) rotate(-30deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes srn-ring{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55);}70%,100%{box-shadow:0 0 0 12px rgba(255,255,255,0);}}
      @keyframes srn-rise{0%{transform:translateY(6px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
      @keyframes srn-float{0%,100%{transform:translateY(0);}50%{transform:translateY(10px);}}
      @keyframes srn-shine{0%{left:-60%;}60%,100%{left:130%;}}
    </style>
    <div class="srn-glow"></div>
    <div class="srn-head">
      <div class="srn-badge">💬</div>
      <div>
        <div class="srn-title">New Support Reply</div>
        <div class="srn-sub">Garena Support Team replied to you</div>
      </div>
    </div>
    <div class="srn-subject"><span class="srn-dot"></span><b>${escapeHtml(subject)}</b></div>
    <a class="srn-btn" href="${supportUrl}" target="_blank" rel="noopener noreferrer">View Reply →</a>
  </div>`;
}

/**
 * Notifies the user who opened a support report that the support team has
 * replied. This is intentionally a small, self-contained helper so the support
 * actions only need a single call and no existing behaviour changes.
 *
 * It does two independent things, mirroring how the rest of the app already
 * works (see `sendNotification` in src/app/actions.ts):
 *   1. Creates a website notification document. The notification bell
 *      auto-linkifies any URL in the message, so we include the /support link.
 *   2. Sends an FCM push (if the user has a token). The push body intentionally
 *      omits the link, and clicking it opens the /support page via the
 *      service worker's `link` data field.
 *
 * Failures are swallowed: a notification problem must never break the admin
 * reply that triggered it.
 *
 * @param db        The already-connected database.
 * @param gamingId  The gaming ID of the user who opened the report.
 * @param subject   The report's subject, e.g. "Support Report 1".
 * @param ticketId  The report id, stored on the notification so it can be
 *                  deleted from the bell once the user has seen the reply.
 */
export async function notifyUserOfSupportReply(
  db: MongoDbWithClient,
  gamingId: string,
  subject: string,
  ticketId: string
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const supportUrl = `${baseUrl}/support`;

    // 1. Website notification — the URL is rendered as a clickable link by the bell.
    const websiteMessage = `Your support ticket "${subject}" got a reply by Garena Support Team. Check it here: ${supportUrl}`;
    const newNotification: Omit<Notification, '_id'> = {
      gamingId,
      message: websiteMessage,
      // Rich animated card for the bell; `message` stays as the plain-text fallback.
      html: buildSupportReplyHtml(subject, supportUrl),
      isRead: false,
      createdAt: new Date(),
      // Tag so it can be removed from the bell the moment the user sees the reply.
      type: 'support_reply',
      supportTicketId: ticketId,
    };
    await db.collection<Notification>('notifications').insertOne(newNotification as Notification);

    // 2. FCM push — same message without the link; clicking opens /support.
    const user = await db.collection<User>('users').findOne({ gamingId });
    if (user?.fcmToken) {
      await sendPushNotification({
        token: user.fcmToken,
        title: 'Garena Support',
        body: `Your support ticket "${subject}" got a reply by Garena Support Team.`,
        link: supportUrl,
      });
    }
  } catch (error) {
    console.error('Support: failed to notify user of reply', error);
  }
}
