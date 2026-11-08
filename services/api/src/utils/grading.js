export const getGradeForPercentage = (percentage, bands = []) => {
  if (!Number.isFinite(percentage) || !Array.isArray(bands) || bands.length === 0) return null;

  const index = bands.findIndex((band, bandIndex) =>
    percentage >= band.minPercentage &&
    (percentage < band.maxPercentage ||
      (bandIndex === bands.length - 1 && percentage <= band.maxPercentage))
  );

  return index >= 0 ? bands[index].grade : null;
};
