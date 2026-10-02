export function requestErrorMessage(status, payload) {
  if (status === 419) return "Your session expired. Reload this page, then try again.";
  if (status === 429) return "Too many attempts. Please wait before trying again.";
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  const validation = Object.values(payload?.errors ?? {}).flat().find(value => typeof value === "string");
  if (validation) return validation;
  if (status < 500 && typeof payload?.message === "string") return payload.message;
  return "Vibyra could not complete that request. Please try again.";
}
