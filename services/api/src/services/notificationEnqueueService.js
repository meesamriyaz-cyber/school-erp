import Notification from "../models/Notification.js";
import { resolveAnnouncementRecipients } from "./notificationRecipientResolver.js";

export async function enqueueAnnouncementPublishedNotifications({
  tenantId, announcement, session = null,
}) {
  const recipients = await resolveAnnouncementRecipients({ tenantId, announcement, session });
  if (!recipients.length) return { recipientCount: 0, queuedCount: 0 };

  const eventKey = `announcement:${announcement._id}:published:${new Date(announcement.publishedAt).toISOString()}`;
  const operations = recipients.map((recipient) => ({
    updateOne: {
      filter: {
        tenantId,
        recipientUserId: recipient.recipientUserId,
        eventKey,
      },
      update: {
        $setOnInsert: {
          tenantId,
          ...recipient,
          eventType: "announcement_published",
          sourceType: "Announcement",
          sourceId: announcement._id,
          eventKey,
          title: announcement.title,
          body: announcement.body,
          link: "/portal?tab=announcements",
          deliveryStatus: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          readAt: null,
        },
      },
      upsert: true,
    },
  }));
  const result = await Notification.bulkWrite(operations, {
    ordered: false,
    ...(session ? { session } : {}),
  });
  return {
    recipientCount: recipients.length,
    queuedCount: result.upsertedCount || 0,
  };
}
