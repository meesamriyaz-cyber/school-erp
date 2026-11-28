import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startSession: vi.fn(), findOneAndUpdate: vi.fn(), enqueue: vi.fn(),
}));
vi.mock("mongoose", () => ({ default: { startSession: mocks.startSession } }));
vi.mock("../models/Announcement.js", () => ({ default: { findOneAndUpdate: mocks.findOneAndUpdate } }));
vi.mock("../services/notificationEnqueueService.js", () => ({
  enqueueAnnouncementPublishedNotifications: mocks.enqueue,
}));

import { publishAnnouncementWithNotifications } from "../services/announcementPublicationService.js";

describe("transactional announcement publication", () => {
  let session;
  const announcement = {
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Parent meeting",
    body: "Please attend.",
    publishedAt: new Date("2026-11-09T09:00:00.000Z"),
    audienceType: "SCHOOL",
    academicYearId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const filter = { _id: announcement._id, tenantId: "cccccccccccccccccccccccc", status: "draft" };
  const update = { $set: { status: "published" } };

  beforeEach(() => {
    vi.clearAllMocks();
    session = {
      withTransaction: vi.fn(async (work) => work()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    mocks.startSession.mockResolvedValue(session);
    mocks.findOneAndUpdate.mockResolvedValue(announcement);
    mocks.enqueue.mockResolvedValue({ recipientCount: 2, queuedCount: 2 });
  });

  it("publishes and enqueues recipients inside the same MongoDB transaction", async () => {
    const result = await publishAnnouncementWithNotifications({
      filter, update, tenantId: filter.tenantId,
    });

    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      filter, update, { new: true, runValidators: true, session },
    );
    expect(mocks.enqueue).toHaveBeenCalledWith({
      tenantId: filter.tenantId, announcement, session,
    });
    expect(result).toBe(announcement);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("aborts publication when recipient notification enqueue fails", async () => {
    const error = new Error("notification persistence unavailable");
    mocks.enqueue.mockRejectedValue(error);

    await expect(publishAnnouncementWithNotifications({
      filter, update, tenantId: filter.tenantId,
    })).rejects.toBe(error);

    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("does not enqueue notifications when the draft changed before publication", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);

    await expect(publishAnnouncementWithNotifications({
      filter, update, tenantId: filter.tenantId,
    })).rejects.toMatchObject({ code: "ANNOUNCEMENT_CONFLICT" });

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
