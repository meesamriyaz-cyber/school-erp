import { getGradeForPercentage } from "./grading.js";

const roundPercentage = (value) => Number(value.toFixed(2));

const buildDistribution = (items, bands, getGrade) => {
  const denominator = items.length;
  const counts = new Map();
  items.forEach((item) => {
    const grade = getGrade(item);
    if (grade) counts.set(grade, (counts.get(grade) || 0) + 1);
  });
  return [...bands]
    .sort((a, b) => a.minPercentage - b.minPercentage)
    .map((band) => {
      const count = counts.get(band.grade) || 0;
      return {
        grade: band.grade,
        count,
        percentage: denominator ? roundPercentage((count / denominator) * 100) : 0,
      };
    });
};

export const buildExaminationAnalytics = ({
  subjects = [],
  enrollments = [],
  marks = [],
  results = [],
  gradingBands = [],
}) => {
  const completeResults = results.filter((result) => result.status !== "incomplete");
  const gradeBearingResults = completeResults.filter((result) => result.grade);
  const subjectAnalytics = subjects.map((subject) => {
    const subjectMarks = marks.filter(
      (mark) => String(mark.examSubjectId) === String(subject._id)
    );
    const scoredMarks = subjectMarks.filter(
      (mark) => !mark.absent && Number.isFinite(Number(mark.marksObtained))
    );
    const percentages = scoredMarks.map((mark) =>
      roundPercentage((Number(mark.marksObtained) / subject.maxMarks) * 100)
    );
    const passedCount = scoredMarks.filter(
      (mark) => Number(mark.marksObtained) >= subject.passMarks
    ).length;
    const failedCount = scoredMarks.length - passedCount;
    const absentCount = subjectMarks.filter((mark) => mark.absent).length;
    const subjectGrades = scoredMarks.map((mark) => ({
      percentage: roundPercentage((Number(mark.marksObtained) / subject.maxMarks) * 100),
    }));

    return {
      examSubjectId: subject._id,
      subject: subject.subjectId,
      maxMarks: subject.maxMarks,
      passMarks: subject.passMarks,
      enrolledCount: enrollments.length,
      recordedCount: subjectMarks.length,
      scoredCount: scoredMarks.length,
      absentCount,
      pendingCount: Math.max(0, enrollments.length - subjectMarks.length),
      passedCount,
      failedCount,
      passRate: scoredMarks.length
        ? roundPercentage((passedCount / scoredMarks.length) * 100)
        : null,
      averagePercentage: percentages.length
        ? roundPercentage(percentages.reduce((total, value) => total + value, 0) / percentages.length)
        : null,
      highestPercentage: percentages.length ? Math.max(...percentages) : null,
      lowestPercentage: percentages.length ? Math.min(...percentages) : null,
      gradeDistribution: buildDistribution(
        subjectGrades,
        gradingBands,
        (item) => getGradeForPercentage(item.percentage, gradingBands)
      ),
    };
  });

  return {
    classPassRate: completeResults.length
      ? roundPercentage((completeResults.filter((result) => result.status === "passed").length / completeResults.length) * 100)
      : null,
    gradeDistribution: buildDistribution(
      gradeBearingResults,
      gradingBands,
      (result) => result.grade
    ),
    subjectAnalytics,
  };
};
