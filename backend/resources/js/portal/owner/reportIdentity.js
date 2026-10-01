// Never render a cached private report after the session's account changes.
export function reportForIdentity(snapshot, userId) {
  return userId != null && snapshot?.userId === userId ? snapshot : null;
}
