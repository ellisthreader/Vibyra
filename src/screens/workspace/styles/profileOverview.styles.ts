import { profileCoreStyles } from "./profileCore.styles";
import { profileLevelsStyles } from "./profileLevels.styles";
import { profileRowsStyles } from "./profileRows.styles";

export const styleSource = {
  ...profileCoreStyles,
  ...profileLevelsStyles,
  ...profileRowsStyles
} as const;
