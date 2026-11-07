import { describe, expect, it } from "vitest";
import { chunkRecords, EXAM_MARK_BATCH_SIZE } from "../lib/examinationMarks.js";

describe("examination mark batching", () => {
  it("uses batches smaller than the API's 500-record limit", () => {
    expect(EXAM_MARK_BATCH_SIZE).toBeLessThan(500);
    expect(EXAM_MARK_BATCH_SIZE).toBe(400);
  });

  it("returns no batches for an empty record list", () => {
    expect(chunkRecords([])).toEqual([]);
  });

  it("keeps a small record list in one batch", () => {
    const records = [{ id: 1 }, { id: 2 }];
    expect(chunkRecords(records)).toEqual([records]);
  });

  it("splits large classes into ordered batches without dropping records", () => {
    const records = Array.from({ length: 950 }, (_, id) => ({ id }));
    const batches = chunkRecords(records);

    expect(batches.map((batch) => batch.length)).toEqual([400, 400, 150]);
    expect(batches.flat()).toEqual(records);
  });

  it("rejects invalid batch sizes", () => {
    expect(() => chunkRecords([], 0)).toThrow(RangeError);
    expect(() => chunkRecords([], 501)).toThrow(RangeError);
    expect(() => chunkRecords([], 1.5)).toThrow(RangeError);
  });

  it("rejects non-array records", () => {
    expect(() => chunkRecords(null)).toThrow(TypeError);
  });
});
