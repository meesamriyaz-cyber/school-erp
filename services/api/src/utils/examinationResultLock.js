import Examination from "../models/Examination.js";

const RESULT_LOCK_LEASE_MS = 5 * 60 * 1000;

export const acquireExaminationResultLock = async ({
  tenantId,
  examinationId,
  statuses,
  token,
}) => {
  const now = new Date();
  return Examination.findOneAndUpdate(
    {
      _id: examinationId,
      tenantId,
      status: { $in: statuses },
      $or: [
        { resultLockExpiresAt: null },
        { resultLockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        resultLockToken: token,
        resultLockExpiresAt: new Date(now.getTime() + RESULT_LOCK_LEASE_MS),
      },
    },
    { new: true }
  ).select("_id status").lean();
};

export const releaseExaminationResultLock = (tenantId, examinationId, token) =>
  Examination.updateOne(
    { _id: examinationId, tenantId, resultLockToken: token },
    { $unset: { resultLockToken: 1, resultLockExpiresAt: 1 } }
  );
