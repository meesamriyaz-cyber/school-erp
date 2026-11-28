export const EXAM_MARK_BATCH_SIZE = 400;

export const chunkRecords = (records, batchSize = EXAM_MARK_BATCH_SIZE) => {
  if (!Array.isArray(records)) throw new TypeError("Records must be an array");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError("Batch size must be between 1 and 500");
  }

  const chunks = [];
  for (let index = 0; index < records.length; index += batchSize) {
    chunks.push(records.slice(index, index + batchSize));
  }
  return chunks;
};
