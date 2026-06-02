import { type MongoDbWithClient } from '@/lib/mongodb';
import type { Notification, User } from '@/lib/definitions';
import { sendPushNotification } from '@/lib/push-notifications';

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
 */
export async function notifyUserOfSupportReply(
  db: MongoDbWithClient,
  gamingId: string,
  subject: string
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const supportUrl = `${baseUrl}/support`;

    // 1. Website notification — the URL is rendered as a clickable link by the bell.
    const websiteMessage = `Your support ticket "${subject}" got a reply by Garena Support Team. Check it here: ${supportUrl}`;
    const newNotification: Omit<Notification, '_id'> = {
      gamingId,
      message: websiteMessage,
      isRead: false,
      createdAt: new Date(),
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
