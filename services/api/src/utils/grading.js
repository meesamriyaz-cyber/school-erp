export const getGradeForPercentage = (percentage, bands = []) => {
  if (!Number.isFinite(percentage) || !Array.isArray(bands) || bands.length === 0) return null;

  const orderedBands = [...bands].sort((a, b) => a.minPercentage - b.minPercentage);
  const index = orderedBands.findIndex((band, bandIndex) =>
    percentage >= band.minPercentage &&
    (percentage < band.maxPercentage ||
      (bandIndex === orderedBands.length - 1 && percentage <= band.maxPercentage))
  );

  return index >= 0 ? orderedBands[index].grade : null;
};
