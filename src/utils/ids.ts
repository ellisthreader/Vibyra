export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
