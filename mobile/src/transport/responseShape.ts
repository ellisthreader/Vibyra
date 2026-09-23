/** Reject a successful HTTP status whose body cannot satisfy the app contract. */
export class ResponseShapeError extends Error {
  readonly status = 502;
  constructor(area: string) {
    super(`${area} returned an unexpected response. Refresh and try again.`);
  }
}
export const objectValue = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const identified = (value: unknown): value is { id: string } =>
  objectValue(value) && typeof value.id === 'string' && value.id.length > 0;
export function requiredObject<T>(
  value: unknown,
  area: string,
  valid: (value: Record<string, unknown>) => boolean,
): T {
  if (!objectValue(value) || !valid(value)) throw new ResponseShapeError(area);
  return value as T;
}
export function requiredList<T>(
  value: unknown,
  area: string,
  valid: (value: unknown) => boolean,
): T[] {
  if (!Array.isArray(value) || !value.every(valid)) throw new ResponseShapeError(area);
  return value as T[];
}
