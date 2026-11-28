import { beforeEach, describe, expect, it, vi } from "vitest";

const { studentFindOne, studentUpdateOne, documentCreate } = vi.hoisted(() => ({
  studentFindOne: vi.fn(),
  studentUpdateOne: vi.fn(),
  documentCreate: vi.fn(),
}));

vi.mock("../models/Student.js", () => ({
  default: { findOne: studentFindOne, updateOne: studentUpdateOne },
}));
vi.mock("../models/StudentDocument.js", () => ({
  default: { create: documentCreate },
}));

import { createStudentDocument } from "../controllers/studentDocumentController.js";

describe("student document profile photo selection", () => {
  const studentId = "507f1f77bcf86cd799439011";
  const tenantId = "507f1f77bcf86cd799439012";
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    studentFindOne.mockReturnValue({
      select: () => ({ lean: async () => ({ _id: studentId }) }),
    });
    documentCreate.mockResolvedValue({
      _id: "507f1f77bcf86cd799439013",
      fileUrl: `https://res.cloudinary.com/test-cloud/image/upload/school-erp/${tenantId}/students/${studentId}/documents/photograph/photo.jpg`,
    });
    studentUpdateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    req = {
      tenantId,
      params: { studentId },
      auth: { userId: "507f1f77bcf86cd799439014" },
      body: {
        name: "Student photograph.jpg",
        category: "photograph",
        fileUrl: `https://res.cloudinary.com/test-cloud/image/upload/school-erp/${tenantId}/students/${studentId}/documents/photograph/photo.jpg`,
        publicId: `school-erp/${tenantId}/students/${studentId}/documents/photograph/photo`,
        resourceType: "image",
        format: "jpg",
        bytes: 12000,
        setAsProfilePhoto: true,
      },
    };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it("updates the tenant-scoped student profile photo when explicitly selected", async () => {
    await createStudentDocument(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(documentCreate).toHaveBeenCalledOnce();
    expect(studentUpdateOne).toHaveBeenCalledWith(
      { _id: studentId, tenantId },
      { $set: { photoUrl: req.body.fileUrl } },
      { runValidators: true },
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoUpdated: true }));
  });

  it("rejects using a non-photograph document as the profile photo", async () => {
    req.body.category = "identity_proof";

    await createStudentDocument(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(studentUpdateOne).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not change the profile photo when the option is not selected", async () => {
    req.body.setAsProfilePhoto = false;

    await createStudentDocument(req, res, next);

    expect(studentUpdateOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoUpdated: false }));
  });
});
