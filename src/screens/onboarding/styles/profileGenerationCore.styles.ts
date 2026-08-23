import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  generatingContent: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 28,
      width: "100%"
    },
  generatingCore: {
      alignItems: "center",
      borderColor: "rgba(91, 124, 250, 0.72)",
      borderRadius: 999,
      borderWidth: 1.5,
      height: 184,
      justifyContent: "center",
      overflow: "hidden",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.78,
      shadowRadius: 42,
      width: 184
    },
  generatingCoreGlass: {
      backgroundColor: "rgba(255, 255, 255, 0.045)",
      borderRadius: 999,
      height: 136,
      left: 20,
      position: "absolute",
      top: 14,
      transform: [{ rotate: "-18deg" }],
      width: 72
    },
  generatingCoreShade: {
      backgroundColor: "rgba(24, 26, 32, 0.28)",
      borderRadius: 999,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: "44%"
    },
  generatingDot: {
      backgroundColor: "rgba(166, 173, 186, 0.96)",
      borderRadius: 999,
      height: 16,
      shadowColor: "#FFFFFF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.92,
      shadowRadius: 18,
      width: 16
    },
  generatingDots: {
      alignItems: "center",
      flexDirection: "row",
      gap: 17,
      justifyContent: "center",
      zIndex: 1
    },
  generatingInnerRing: {
      borderColor: "rgba(91, 124, 250, 0.22)",
      borderRadius: 999,
      borderWidth: 1,
      height: 252,
      position: "absolute",
      width: 252
    }
} as const;
