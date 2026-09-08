type State = Record<string, unknown>;
export type StateChange = {
  path: string[];
  beforePresent: boolean;
  before?: unknown;
  remove: boolean;
  value?: unknown;
};

const own = (value: State, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is State => value !== null && typeof value === "object" && !Array.isArray(value);

// Arrays with the same length are compared by index. Structural array changes
// stay atomic, so deleting/inserting a message never shifts another edit.
export function cloudStateChanges(before: State, after: State): StateChange[] {
  const changes: StateChange[] = [];
  function diff(left: unknown, right: unknown, path: string[], present = true, nextPresent = true) {
    if (present === nextPresent && left === right) return;
    if (present && nextPresent && object(left) && object(right)) {
      const start = changes.length;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        diff(left[key], right[key], [...path, key], own(left, key), own(right, key));
      }
      // Message identity must still match if another client reordered an array.
      if (changes.length > start && own(left, "id") && left.id === right.id) {
        changes.splice(start, 0, { path: [...path, "id"], beforePresent: true,
          before: left.id, remove: false, value: left.id });
      }
      return;
    }
    if (present && nextPresent && Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
      left.forEach((value, index) => diff(value, right[index], [...path, String(index)]));
      return;
    }
    changes.push({ path, beforePresent: present, ...(present ? { before: left } : {}),
      remove: !nextPresent, ...(nextPresent ? { value: right } : {}) });
  }
  diff(before, after, []);
  if (changes.length <= 256) return changes;
  // A bulk restore uses at most three atomic root-field replacements.
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((key) => ({
    path: [key], beforePresent: own(before, key), before: before[key],
    remove: !own(after, key), value: after[key]
  }));
}
