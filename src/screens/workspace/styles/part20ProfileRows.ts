import { part20ProfileModal } from "./part20ProfileModal";
import { part20ProfileRowsRest } from "./part20ProfileRowsRest";

export const part20ProfileRows = {
  ...part20ProfileModal,
  ...part20ProfileRowsRest
} as const;
