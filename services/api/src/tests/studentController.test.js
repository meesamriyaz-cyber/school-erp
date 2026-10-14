import { beforeEach, describe, expect, it, vi } from "vitest";

const { find, countDocuments, create, findOne, findOneAndUpdate } =
  vi.hoisted(() => ({
    find: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }));

vi.mock("../models/Student.js", () => ({
  default: {
    find,
    countDocuments,
    create,
    findOne,
    findOneAndUpdate,
  },
}));

import {
  createStudent,
  getStudent,
  listStudents,
} from "../controllers/studentController.js";

describe("studentController error forwarding", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      tenantId: "tenant-123",
      params: {},
      query: {},
      body: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it("forwards unexpected student creation errors", async () => {
    const error = new Error("Unexpected database failure");
    create.mockRejectedValueOnce(error);

    req.body = {
      admissionNumber: "ADM-001",
      firstName: "Amina",
    };

    await createStudent(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("forwards unexpected student listing errors", async () => {
    const error = new Error("Unexpected database failure");

    find.mockImplementationOnce(() => {
      throw error;
    });

    await listStudents(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("forwards unexpected student retrieval errors", async () => {
    const error = new Error("Unexpected database failure");
    findOne.mockImplementationOnce(() => {
      throw error;
    });

    req.params.studentId = "507f1f77bcf86cd799439011";

    await getStudent(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
  
it("lists students without applying a search filter when search is empty", async () => {
  find.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });

  countDocuments.mockResolvedValue(0);
  req.query.search = "";

  await listStudents(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(find).toHaveBeenCalledWith(
    expect.not.objectContaining({
      $or: expect.anything(),
    }),
  );
});

});
