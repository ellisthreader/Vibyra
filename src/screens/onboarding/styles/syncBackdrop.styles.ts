import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  syncAuraCyan: {
      backgroundColor: "rgba(91, 124, 250, 0.16)",
      borderRadius: 999,
      height: 360,
      left: -150,
      position: "absolute",
      top: 36,
      width: 360
    },
  syncAuraPurple: {
      backgroundColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 999,
      bottom: 86,
      height: 380,
      position: "absolute",
      right: -150,
      width: 380
    },
  syncAuroraBand: {
      borderRadius: 999,
      height: 260,
      left: -70,
      position: "absolute",
      right: -90,
      top: 82,
      transform: [{ rotate: "11deg" }]
    }
} as const;
