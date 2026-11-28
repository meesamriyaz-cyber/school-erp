import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), countDocuments: vi.fn(), findOneAndUpdate: vi.fn(), updateMany: vi.fn(),
  studentFindOne: vi.fn(), studentFind: vi.fn(), guardianFindOne: vi.fn(), relationshipFind: vi.fn(),
}));
vi.mock("../models/Student.js", () => ({ default: { findOne: mocks.studentFindOne, find: mocks.studentFind } }));
vi.mock("../models/Guardian.js", () => ({ default: { findOne: mocks.guardianFindOne } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { find: mocks.relationshipFind } }));
vi.mock("../models/Notification.js", () => ({ default: {
  find: mocks.find, countDocuments: mocks.countDocuments,
  findOneAndUpdate: mocks.findOneAndUpdate, updateMany: mocks.updateMany,
} }));

import {
  listMyNotifications, markNotificationRead, markAllNotificationsRead, listNotificationDelivery,
} from "../controllers/notificationController.js";

const chain = (value) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});

describe("notification inbox and delivery history", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { tenantId: "aaaaaaaaaaaaaaaaaaaaaaaa", auth: { userId: "bbbbbbbbbbbbbbbbbbbbbbbb", role: "parent" }, query: {}, params: {}, body: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
    mocks.guardianFindOne.mockReturnValue(chain({ _id: "dddddddddddddddddddddddd" }));
    mocks.studentFind.mockReturnValue(chain([{ _id: "eeeeeeeeeeeeeeeeeeeeeeee" }]));
    mocks.relationshipFind.mockReturnValue(chain([{ studentId: "eeeeeeeeeeeeeeeeeeeeeeee" }]));
    mocks.find.mockReturnValue(chain([{ _id: "notice-a", deliveryStatus: "delivered", relatedStudentIds: ["eeeeeeeeeeeeeeeeeeeeeeee"] }]));
    mocks.countDocuments.mockResolvedValue(2);
    mocks.findOneAndUpdate.mockReturnValue(chain({ _id: "notice-a", readAt: new Date() }));
    mocks.updateMany.mockResolvedValue({ modifiedCount: 2 });
  });

  it("lists only delivered notifications belonging to the authenticated recipient and tenant", async () => {
    await listMyNotifications(req, res, next);
    expect(mocks.find).toHaveBeenCalledWith({
      tenantId: req.tenantId,
      recipientUserId: req.auth.userId,
      deliveryStatus: "delivered",
      relatedStudentIds: { $in: ["eeeeeeeeeeeeeeeeeeeeeeee"] },
    });
    expect(mocks.countDocuments).toHaveBeenCalledWith({
      tenantId: req.tenantId, recipientUserId: req.auth.userId,
      deliveryStatus: "delivered", relatedStudentIds: { $in: ["eeeeeeeeeeeeeeeeeeeeeeee"] }, readAt: null,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, data: [{ _id: "notice-a", deliveryStatus: "delivered", relatedStudentIds: ["eeeeeeeeeeeeeeeeeeeeeeee"] }], unreadCount: 2,
    }));
  });

  it("rejects invalid inbox limits and cursors", async () => {
    req.query.limit = "101";
    await listMyNotifications(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("marks read only for the current tenant and recipient", async () => {
    req.params.notificationId = "cccccccccccccccccccccccc";
    await markNotificationRead(req, res, next);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({
      _id: req.params.notificationId,
      tenantId: req.tenantId,
      recipientUserId: req.auth.userId,
      deliveryStatus: "delivered",
      relatedStudentIds: { $in: ["eeeeeeeeeeeeeeeeeeeeeeee"] },
    }, { $set: { readAt: expect.any(Date) } }, { new: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("marks all delivered notifications read only for the current recipient", async () => {
    await markAllNotificationsRead(req, res, next);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      tenantId: req.tenantId, recipientUserId: req.auth.userId,
      deliveryStatus: "delivered", relatedStudentIds: { $in: ["eeeeeeeeeeeeeeeeeeeeeeee"] }, readAt: null,
    }, { $set: { readAt: expect.any(Date) } });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { modifiedCount: 2 } });
  });

  it("restricts delivery history to the active tenant and validates filters", async () => {
    req.auth.role = "school_admin";
    req.query.status = "failed";
    await listNotificationDelivery(req, res, next);
    expect(mocks.find).toHaveBeenCalledWith({ tenantId: req.tenantId, deliveryStatus: "failed" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects unknown delivery statuses", async () => {
    req.auth.role = "principal";
    req.query.status = "sent";
    await listNotificationDelivery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("revokes access to stored notifications when the guardian relationship is no longer authorized", async () => {
    mocks.relationshipFind.mockReturnValue(chain([]));
    await listMyNotifications(req, res, next);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true, data: [], unreadCount: 0, nextCursor: null,
    });
  });

  it("does not allow a guardian to mark a notification read after communication access is revoked", async () => {
    mocks.relationshipFind.mockReturnValue(chain([]));
    req.params.notificationId = "cccccccccccccccccccccccc";
    await markNotificationRead(req, res, next);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes revoked child references from a parent's stored notification payload", async () => {
    mocks.find.mockReturnValue(chain([{
      _id: "notice-a",
      relatedStudentIds: ["eeeeeeeeeeeeeeeeeeeeeeee", "ffffffffffffffffffffffff"],
    }]));
    await listMyNotifications(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        relatedStudentIds: ["eeeeeeeeeeeeeeeeeeeeeeee"],
      })],
    }));
  });

  it("does not expose notifications for inactive student profiles linked to a guardian", async () => {
    mocks.studentFind.mockReturnValue(chain([]));
    await listMyNotifications(req, res, next);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true, data: [], unreadCount: 0, nextCursor: null,
    });
  });

});
