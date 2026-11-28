import { describe, expect, it } from "vitest";
import { getGradeForPercentage } from "../utils/grading.js";

const bands = [
  { grade: "A", minPercentage: 80, maxPercentage: 100 },
  { grade: "F", minPercentage: 0, maxPercentage: 35 },
  { grade: "D", minPercentage: 35, maxPercentage: 50 },
  { grade: "C", minPercentage: 50, maxPercentage: 65 },
  { grade: "B", minPercentage: 65, maxPercentage: 80 },
];

describe("percentage grading", () => {
  it.each([
    [0, "F"],
    [34.99, "F"],
    [35, "D"],
    [49.99, "D"],
    [50, "C"],
    [64.99, "C"],
    [65, "B"],
    [79.99, "B"],
    [80, "A"],
    [100, "A"],
  ])("assigns %s to grade %s at exact band boundaries", (percentage, grade) => {
    expect(getGradeForPercentage(percentage, bands)).toBe(grade);
  });

  it("returns null for invalid percentages or missing grading bands", () => {
    expect(getGradeForPercentage(-0.01, bands)).toBeNull();
    expect(getGradeForPercentage(100.01, bands)).toBeNull();
    expect(getGradeForPercentage(Number.NaN, bands)).toBeNull();
    expect(getGradeForPercentage(50, [])).toBeNull();
  });
});
