import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bulkWrite: vi.fn(), resolveRecipients: vi.fn(), resolveScopedRecipients: vi.fn() }));
vi.mock("../models/Notification.js", () => ({ default: { bulkWrite: mocks.bulkWrite } }));
vi.mock("../services/notificationRecipientResolver.js", () => ({
  resolveAnnouncementRecipients: mocks.resolveRecipients,
  resolveStudentScopedRecipients: mocks.resolveScopedRecipients,
}));

import { enqueueAnnouncementPublishedNotifications, enqueueStudentScopedNotification } from "../services/notificationEnqueueService.js";

describe("announcement notification enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveScopedRecipients.mockResolvedValue([
      { recipientUserId: "aaaaaaaaaaaaaaaaaaaaaaaa", recipientRole: "student", relatedStudentIds: ["bbbbbbbbbbbbbbbbbbbbbbbb"] },
    ]);
    mocks.resolveRecipients.mockResolvedValue([
      { recipientUserId: "aaaaaaaaaaaaaaaaaaaaaaaa", recipientRole: "student", relatedStudentIds: ["bbbbbbbbbbbbbbbbbbbbbbbb"] },
      { recipientUserId: "cccccccccccccccccccccccc", recipientRole: "parent", relatedStudentIds: ["bbbbbbbbbbbbbbbbbbbbbbbb"] },
    ]);
    mocks.bulkWrite.mockResolvedValue({ upsertedCount: 2 });
  });

  it("creates one idempotent recipient record per resolved user", async () => {
    const announcement = {
      _id: "dddddddddddddddddddddddd",
      title: "Parent meeting",
      body: "Please attend.",
      publishedAt: "2026-11-09T09:00:00.000Z",
    };
    const result = await enqueueAnnouncementPublishedNotifications({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee", announcement,
    });

    expect(mocks.resolveRecipients).toHaveBeenCalledWith({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee", announcement, session: null,
    });
    const [operations, options] = mocks.bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne).toMatchObject({
      filter: {
        tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
        recipientUserId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        eventKey: "announcement:dddddddddddddddddddddddd:published:2026-11-09T09:00:00.000Z",
      },
      upsert: true,
      update: { $setOnInsert: expect.objectContaining({
        eventType: "announcement_published",
        sourceType: "Announcement",
        sourceId: announcement._id,
        title: announcement.title,
        body: announcement.body,
        deliveryStatus: "pending",
      }) },
    });
    expect(options).toEqual({ ordered: false });
    expect(result).toEqual({ recipientCount: 2, queuedCount: 2 });
  });

  it("enqueues a scoped lifecycle event idempotently using the resolved active recipients", async () => {
    const session = { id: "transaction" };
    mocks.bulkWrite.mockResolvedValue({ upsertedCount: 1 });
    const result = await enqueueStudentScopedNotification({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
      enrollmentIds: ["ffffffffffffffffffffffff"],
      eventType: "homework_published",
      sourceType: "Homework",
      sourceId: "dddddddddddddddddddddddd",
      eventKey: "homework:dddddddddddddddddddddddd:published",
      title: "New homework: Algebra",
      body: "Complete exercises 1–5.",
      link: "/portal?tab=homework",
      session,
    });
    expect(mocks.resolveScopedRecipients).toHaveBeenCalledWith({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
      enrollmentIds: ["ffffffffffffffffffffffff"],
      session,
    });
    expect(mocks.bulkWrite).toHaveBeenCalledWith([
      { updateOne: {
        filter: {
          tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
          recipientUserId: "aaaaaaaaaaaaaaaaaaaaaaaa",
          eventKey: "homework:dddddddddddddddddddddddd:published",
        },
        update: { $setOnInsert: expect.objectContaining({
          eventType: "homework_published",
          sourceType: "Homework",
          sourceId: "dddddddddddddddddddddddd",
          title: "New homework: Algebra",
          link: "/portal?tab=homework",
          deliveryStatus: "pending",
        }) },
        upsert: true,
      }},
    ], { ordered: false, session });
    expect(result).toEqual({ recipientCount: 1, queuedCount: 1 });
  });

  it("does not write anything when no eligible recipients exist", async () => {
    mocks.resolveRecipients.mockResolvedValue([]);
    const result = await enqueueAnnouncementPublishedNotifications({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
      announcement: { _id: "dddddddddddddddddddddddd", publishedAt: "2026-11-09T09:00:00.000Z" },
    });
    expect(mocks.bulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ recipientCount: 0, queuedCount: 0 });
  });

  it("passes the active transaction session through recipient resolution and persistence", async () => {
    const session = { id: "session" };
    await enqueueAnnouncementPublishedNotifications({
      tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
      announcement: { _id: "dddddddddddddddddddddddd", publishedAt: "2026-11-09T09:00:00.000Z" },
      session,
    });
    expect(mocks.resolveRecipients).toHaveBeenCalledWith(expect.objectContaining({ session }));
    expect(mocks.bulkWrite).toHaveBeenCalledWith(expect.any(Array), { ordered: false, session });
  });
});
