/**
 * Active guardian relationships grant academic portal access only when the
 * school has explicitly enabled it. Legacy primary links without the new
 * field remain accessible for backwards compatibility; legacy secondary
 * links do not.
 */
export const guardianPortalAccessFilter = () => ({
  $or: [
    { canAccessPortal: true },
    { isPrimary: true, canAccessPortal: { $exists: false } },
  ],
});

export const defaultGuardianPortalAccess = ({ isPrimary, requestedAccess }) => {
  if (typeof requestedAccess === "boolean") return requestedAccess;
  return Boolean(isPrimary);
};
