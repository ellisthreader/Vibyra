import { StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

export const emailStyles = StyleSheet.create({
  emailInput: {
    backgroundColor: "rgba(24, 26, 32, 0.62)",
    borderColor: "rgba(91, 124, 250, 0.32)",
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 16,
    width: "100%"
  },
  emailModeButton: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    height: 34,
    justifyContent: "center"
  },
  emailModeButtonActive: {
    backgroundColor: "rgba(91, 124, 250, 0.28)",
    borderColor: "rgba(91, 124, 250, 0.42)",
    borderWidth: 1
  },
  emailModeRow: {
    backgroundColor: "rgba(24, 26, 32, 0.46)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    width: "100%"
  },
  emailModeText: {
    color: "rgba(166, 173, 186, 0.64)",
    fontSize: 13,
    fontWeight: "900"
  },
  emailModeTextActive: { color: colors.text },
  emailPanel: {
    alignItems: "center",
    backgroundColor: "rgba(24, 26, 32, 0.62)",
    borderColor: "rgba(91, 124, 250, 0.42)",
    borderRadius: 26,
    borderWidth: 1,
    gap: 9,
    overflow: "hidden",
    padding: 12,
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: "100%"
  },
  emailSubmitButton: {
    alignItems: "center",
    backgroundColor: "#4667E8",
    borderRadius: 18,
    height: 48,
    justifyContent: "center",
    marginTop: 2,
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    width: "100%"
  },
  emailSubmitButtonDisabled: {
    backgroundColor: "rgba(91, 124, 250, 0.42)",
    shadowOpacity: 0
  },
  emailSubmitText: { color: colors.text, fontSize: 16, fontWeight: "900" }
});
