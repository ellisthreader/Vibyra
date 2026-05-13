import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part42 = {
  lowCreditsButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.14)",
    borderColor: "rgba(255, 242, 0, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12
  },
  lowCreditsButtonText: {
    color: "#FFF200",
    fontSize: 12,
    fontWeight: "900"
  },
  lowCreditsCard: {
    alignItems: "center",
    backgroundColor: "rgba(13, 15, 25, 0.94)",
    borderColor: "rgba(255, 242, 0, 0.22)",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 10,
    padding: 12,
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  lowCreditsCopy: {
    flex: 1,
    minWidth: 0
  },
  lowCreditsIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.1)",
    borderColor: "rgba(255, 242, 0, 0.26)",
    borderRadius: 11,
    borderWidth: 1,
    height: 39,
    justifyContent: "center",
    width: 39
  },
  lowCreditsText: {
    color: "#C9C3D5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 2
  },
  lowCreditsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  chatModelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
    height: 36,
    minWidth: 0,
    paddingHorizontal: 10
  },
  chatModelButtonText: {
    color: "#DAD6E7",
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  chatModelButtonBadge: {
    backgroundColor: "rgba(124, 241, 179, 0.11)",
    borderColor: "rgba(124, 241, 179, 0.28)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#7CF1B3",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase"
  },
  chatModelButtonToolbar: {
    flex: 1,
    minWidth: 0
  },
} as const;
