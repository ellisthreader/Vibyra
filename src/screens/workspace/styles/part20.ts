import { part20ProfileCore } from "./part20ProfileCore";
import { part20ProfileLevels } from "./part20ProfileLevels";
import { part20ProfileRows } from "./part20ProfileRows";

export const part20 = {
  ...part20ProfileCore,
  ...part20ProfileLevels,
  ...part20ProfileRows
} as const;
