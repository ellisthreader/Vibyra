export function finding(id, status, message, severity = "error") {
  return { id, status, severity, message };
}

export function pass(id, message) {
  return finding(id, "pass", message, "info");
}

export function fail(id, message) {
  return finding(id, "fail", message);
}

export function warn(id, message) {
  return finding(id, "manual", message, "warning");
}
