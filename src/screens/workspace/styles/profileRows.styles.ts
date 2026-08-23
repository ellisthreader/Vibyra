import { profileModalStyles } from "./profileModal.styles";
import { profileRowsRestStyles } from "./profileRowsRest.styles";

export const profileRowsStyles = {
  ...profileModalStyles,
  ...profileRowsRestStyles
} as const;
