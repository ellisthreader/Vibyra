import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  subtitle: { color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22, marginTop: 12 },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", lineHeight: 38 }
} as const;
