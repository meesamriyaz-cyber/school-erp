import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Announcement from "../models/Announcement.js";

const validAnnouncement = (overrides = {}) => ({
  tenantId: new mongoose.Types.ObjectId(),
  title: "School reopens",
  body: "The school will reopen on Monday.",
  category: "general",
  audienceType: "SCHOOL",
  academicYearId: new mongoose.Types.ObjectId(),
  createdBy: new mongoose.Types.ObjectId(),
  updatedBy: new mongoose.Types.ObjectId(),
  ...overrides,
});

describe("Announcement model", () => {
  it("accepts a valid school-wide draft", async () => {
    const announcement = new Announcement(validAnnouncement());
    await expect(announcement.validate()).resolves.toBeUndefined();
    expect(announcement.status).toBe("draft");
    expect(announcement.auditTrail).toEqual([]);
  });

  it("requires tenant, title, body, academic year and actor references", async () => {
    const announcement = new Announcement(validAnnouncement({
      tenantId: undefined,
      title: undefined,
      body: undefined,
      academicYearId: undefined,
      createdBy: undefined,
      updatedBy: undefined,
    }));
    await expect(announcement.validate()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("requires a class for class-wide notices and disallows a section", async () => {
    const missingClass = new Announcement(validAnnouncement({ audienceType: "CLASS" }));
    await expect(missingClass.validate()).rejects.toMatchObject({ name: "ValidationError" });

    const withSection = new Announcement(validAnnouncement({
      audienceType: "CLASS",
      classId: new mongoose.Types.ObjectId(),
      sectionId: new mongoose.Types.ObjectId(),
    }));
    await expect(withSection.validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("requires both class and section for section notices", async () => {
    const announcement = new Announcement(validAnnouncement({
      audienceType: "SECTION",
      classId: new mongoose.Types.ObjectId(),
    }));
    await expect(announcement.validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects class and section targets on school-wide notices", async () => {
    const announcement = new Announcement(validAnnouncement({
      classId: new mongoose.Types.ObjectId(),
    }));
    await expect(announcement.validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects unsupported category and lifecycle status", async () => {
    const announcement = new Announcement(validAnnouncement({
      category: "unlisted",
      status: "deleted",
    }));
    await expect(announcement.validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("keeps tenant, academic year and audience placement immutable", () => {
    for (const field of ["tenantId", "academicYearId", "audienceType", "classId", "sectionId", "createdBy"]) {
      expect(Announcement.schema.path(field).options.immutable).toBe(true);
    }
  });

  it("indexes tenant-scoped publication and audience queries", () => {
    expect(Announcement.schema.indexes()).toEqual(expect.arrayContaining([
      [{ tenantId: 1, status: 1, publishedAt: -1 }, expect.any(Object)],
      [{ tenantId: 1, academicYearId: 1, audienceType: 1, classId: 1, sectionId: 1, status: 1 }, expect.any(Object)],
    ]));
  });
});
