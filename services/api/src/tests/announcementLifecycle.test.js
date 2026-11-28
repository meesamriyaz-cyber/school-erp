import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  announcementFindOne: vi.fn(), announcementFindOneAndUpdate: vi.fn(), publishWithNotifications: vi.fn(),
}));
vi.mock("../services/announcementPublicationService.js", () => ({ publishAnnouncementWithNotifications: mocks.publishWithNotifications }));
vi.mock("../models/Announcement.js", () => ({
  default: { findOne: mocks.announcementFindOne, findOneAndUpdate: mocks.announcementFindOneAndUpdate },
}));
vi.mock("../models/AcademicYear.js", () => ({ default: {} }));
vi.mock("../models/SchoolClass.js", () => ({ default: {} }));
vi.mock("../models/Section.js", () => ({ default: {} }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: { exists: vi.fn() } }));
vi.mock("../models/Enrollment.js", () => ({ default: {} }));
vi.mock("../models/Student.js", () => ({ default: {} }));
vi.mock("../models/Guardian.js", () => ({ default: {} }));
vi.mock("../models/StudentGuardian.js", () => ({ default: {} }));

import { archiveAnnouncement, publishAnnouncement } from "../controllers/announcementController.js";

const query = (value) => ({ lean: vi.fn().mockResolvedValue(value) });
const objectId = "aaaaaaaaaaaaaaaaaaaaaaaa";

describe("announcement publication lifecycle", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenantId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      auth: { userId: "cccccccccccccccccccccccc", role: "school_admin" },
      params: { announcementId: objectId },
      body: {},
    };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
    mocks.announcementFindOneAndUpdate.mockResolvedValue({ _id: objectId, status: "published" });
    mocks.publishWithNotifications.mockResolvedValue({ _id: objectId, status: "published" });
  });

  it("publishes only a draft belonging to the active tenant and records the actor", async () => {
    mocks.announcementFindOne.mockReturnValue(query({ _id: objectId, status: "draft", expiresAt: null }));
    await publishAnnouncement(req, res, next);

    expect(mocks.announcementFindOne).toHaveBeenCalledWith({
      _id: objectId, tenantId: req.tenantId, status: "draft",
    });
    expect(mocks.publishWithNotifications).toHaveBeenCalledWith({
      filter: { _id: objectId, tenantId: req.tenantId, status: "draft" },
      tenantId: req.tenantId,
      update: expect.objectContaining({
        $set: expect.objectContaining({ status: "published", publishedAt: expect.any(Date), updatedBy: req.auth.userId }),
        $push: { auditTrail: expect.objectContaining({ action: "published", actorUserId: req.auth.userId }) },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses to publish an expired draft", async () => {
    mocks.announcementFindOne.mockReturnValue(query({
      _id: objectId, status: "draft", expiresAt: new Date(Date.now() - 60_000),
    }));
    await publishAnnouncement(req, res, next);

    expect(mocks.publishWithNotifications).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("archives only a published notice in the tenant and records the actor", async () => {
    mocks.announcementFindOne.mockReturnValue(query({ _id: objectId, status: "published" }));
    mocks.announcementFindOneAndUpdate.mockResolvedValue({ _id: objectId, status: "archived" });
    await archiveAnnouncement(req, res, next);

    expect(mocks.announcementFindOne).toHaveBeenCalledWith({
      _id: objectId, tenantId: req.tenantId, status: "published",
    });
    expect(mocks.announcementFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: objectId, tenantId: req.tenantId, status: "published" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "archived", archivedAt: expect.any(Date), updatedBy: req.auth.userId }),
        $push: { auditTrail: expect.objectContaining({ action: "archived", actorUserId: req.auth.userId }) },
      }),
      { new: true, runValidators: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not allow an archived or missing notice to be published again", async () => {
    mocks.announcementFindOne.mockReturnValue(query(null));
    await publishAnnouncement(req, res, next);

    expect(mocks.announcementFindOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
