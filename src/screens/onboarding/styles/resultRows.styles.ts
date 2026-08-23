import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3, textAlign: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" }
} as const;
