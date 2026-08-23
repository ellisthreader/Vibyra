import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  sectionTitle: { alignSelf: "flex-start", color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24, marginTop: 26 },
  shell: { backgroundColor: colors.background, flex: 1 }
} as const;
