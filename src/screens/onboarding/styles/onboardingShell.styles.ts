import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  onboarding: { alignItems: "center", flex: 1, justifyContent: "center", padding: 22 },
  onboardingFooter: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 18 }
} as const;
