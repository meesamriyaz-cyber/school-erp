import Notification from "../models/Notification.js";
import { resolveAnnouncementRecipients, resolveStudentScopedRecipients } from "./notificationRecipientResolver.js";

async function insertNotifications({ tenantId, recipients, eventType, sourceType, sourceId, eventKey, title, body, link, session }) {
  if (!recipients.length) return { recipientCount: 0, queuedCount: 0 };
  const operations = recipients.map((recipient) => ({
    updateOne: {
      filter: { tenantId, recipientUserId: recipient.recipientUserId, eventKey },
      update: { $setOnInsert: {
        tenantId, ...recipient, eventType, sourceType, sourceId, eventKey, title, body, link,
        deliveryStatus: "pending", attempts: 0, nextAttemptAt: new Date(), readAt: null,
      }},
      upsert: true,
    },
  }));
  const result = await Notification.bulkWrite(operations, { ordered: false, ...(session ? { session } : {}) });
  return { recipientCount: recipients.length, queuedCount: result.upsertedCount || 0 };
}

export async function enqueueAnnouncementPublishedNotifications({ tenantId, announcement, session = null }) {
  const recipients = await resolveAnnouncementRecipients({ tenantId, announcement, session });
  return insertNotifications({
    tenantId, recipients, eventType: "announcement_published", sourceType: "Announcement",
    sourceId: announcement._id,
    eventKey: `announcement:${announcement._id}:published:${new Date(announcement.publishedAt).toISOString()}`,
    title: announcement.title, body: announcement.body, link: "/portal?tab=announcements", session,
  });
}

export async function enqueueStudentScopedNotification({
  tenantId, enrollmentIds, eventType, sourceType, sourceId, eventKey, title, body,
  link = "/portal?tab=notifications", session = null,
}) {
  const recipients = await resolveStudentScopedRecipients({ tenantId, enrollmentIds, session });
  return insertNotifications({ tenantId, recipients, eventType, sourceType, sourceId, eventKey, title, body, link, session });
}
