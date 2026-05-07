import { ImageStyle } from "react-native";
import { styles } from "../styles";
import { ProjectLayout } from "../types";

export function getProjectsLayout(width: number, height: number): ProjectLayout {
  const portraitRatio = height / width;
  const narrow = width <= 393;
  const compact = width <= 375;
  const roomy = width >= 428;
  const tallNarrow = portraitRatio >= 2.1 && width <= 393;

  if (compact) {
    return {
      cardStyle: { borderRadius: 14, padding: 12 },
      createIconSize: 23,
      folderIconSize: 21,
      footerActionsStyle: styles.projectFooterActionsStacked,
      footerDetailsStyle: styles.projectFooterDetailsStacked,
      footerStyle: styles.projectCardFooterStacked,
      heroImageStyle: styles.projectsFoldersHeroCompact as ImageStyle,
      iconBoxStyle: { borderRadius: 11, height: 38, width: 38 },
      mainGap: 9,
      openGradientStyle: { height: 32, paddingHorizontal: 10 },
      openIconSize: 15,
      openTextStyle: { fontSize: 12 },
      statusStyle: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 5 }
    };
  }

  if (narrow || tallNarrow) {
    return {
      cardStyle: { borderRadius: 15, padding: 14 },
      createIconSize: 25,
      folderIconSize: 22,
      footerActionsStyle: styles.projectFooterActionsStacked,
      footerDetailsStyle: styles.projectFooterDetailsStacked,
      footerStyle: styles.projectCardFooterStacked,
      heroImageStyle: styles.projectsFoldersHeroNarrow as ImageStyle,
      iconBoxStyle: { borderRadius: 12, height: 40, width: 40 },
      mainGap: 10,
      openGradientStyle: { height: 33, paddingHorizontal: 11 },
      openIconSize: 16,
      openTextStyle: { fontSize: 12 },
      statusStyle: { fontSize: 10, paddingHorizontal: 9, paddingVertical: 5 }
    };
  }

  if (!roomy) {
    return {
      cardStyle: { borderRadius: 15, padding: 15 },
      createIconSize: 26,
      folderIconSize: 23,
      footerActionsStyle: styles.projectFooterActionsComfort,
      footerDetailsStyle: styles.projectFooterDetails,
      footerStyle: styles.projectCardFooterComfort,
      heroImageStyle: styles.projectsFoldersHeroComfort as ImageStyle,
      iconBoxStyle: { borderRadius: 12, height: 42, width: 42 },
      mainGap: 11,
      openGradientStyle: { height: 34, paddingHorizontal: 11 },
      openIconSize: 16,
      openTextStyle: null,
      statusStyle: { paddingHorizontal: 9 }
    };
  }

  return {
    cardStyle: null,
    createIconSize: 27,
    folderIconSize: 24,
    footerActionsStyle: styles.projectFooterActions,
    footerDetailsStyle: styles.projectFooterDetails,
    footerStyle: null,
    heroImageStyle: null,
    iconBoxStyle: null,
    mainGap: 12,
    openGradientStyle: null,
    openIconSize: 17,
    openTextStyle: null,
    statusStyle: null
  };
}
