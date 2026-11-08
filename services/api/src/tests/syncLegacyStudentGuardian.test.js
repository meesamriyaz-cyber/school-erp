import { describe, expect, it, vi, beforeEach } from "vitest";

const { guardianFind, linkFindOne, linkExists, guardianCreate, linkCreate } = vi.hoisted(() => ({
  guardianFind: vi.fn(), linkFindOne: vi.fn(), linkExists: vi.fn(), guardianCreate: vi.fn(), linkCreate: vi.fn(),
}));
vi.mock("../models/Guardian.js", () => ({ default: { find: guardianFind, create: guardianCreate } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { findOne: linkFindOne, exists: linkExists, create: linkCreate } }));

import { previewLegacyStudentGuardian, syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";

const student = (overrides = {}) => ({
  _id: "student-1", tenantId: "tenant-1", guardianName: "Amina Khan",
  guardianPhone: "9999999999", guardianEmail: "amina@example.test", ...overrides,
});
const query = (value) => ({ lean: vi.fn().mockResolvedValue(value), session: vi.fn().mockReturnThis() });

describe("legacy guardian normalization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not match by name alone when no contact identity is available", async () => {
    guardianFind.mockReturnValue(query([]));
    await expect(previewLegacyStudentGuardian(student({ guardianPhone: null, guardianEmail: null })))
      .resolves.toMatchObject({ status: "new_guardian" });
    expect(guardianFind).not.toHaveBeenCalled();
  });

  it("reports a conflict when phone and email resolve to different guardians", async () => {
    guardianFind.mockReturnValue(query([
      { _id: "guardian-1", phone: "9999999999", email: "one@example.test" },
      { _id: "guardian-2", phone: "8888888888", email: "amina@example.test" },
    ]));
    await expect(previewLegacyStudentGuardian(student())).resolves.toMatchObject({ status: "ambiguous" });
  });

  it("reports a new guardian when no contact identity matches", async () => {
    guardianFind.mockReturnValue(query([]));
    await expect(previewLegacyStudentGuardian(student())).resolves.toMatchObject({ status: "new_guardian" });
  });

  it("reports an existing guardian match", async () => {
    guardianFind.mockReturnValue(query([{ _id: "guardian-1", phone: "9999999999", email: "amina@example.test" }]));
    await expect(previewLegacyStudentGuardian(student())).resolves.toMatchObject({ status: "matched", guardianId: "guardian-1" });
  });

  it("deactivates only legacy-derived links when legacy fields are cleared", async () => {
    const link = { status: "active", save: vi.fn() };
    linkFindOne.mockResolvedValue(link);
    await syncLegacyStudentGuardian(student({ guardianName: "", guardianPhone: null, guardianEmail: null }));
    expect(link.status).toBe("inactive");
    expect(link.save).toHaveBeenCalled();
  });
});
