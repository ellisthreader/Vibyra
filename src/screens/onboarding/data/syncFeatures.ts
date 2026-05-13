import { Ionicons } from "@expo/vector-icons";

export const syncFeatures: Array<{
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
  borderColor: string;
  iconBackgroundColor: string;
}> = [
  {
    title: "Instant handoff",
    body: "Switch devices in a second.",
    icon: "swap-horizontal-outline",
    color: "#C77DFF",
    backgroundColor: "rgba(151, 54, 255, 0.09)",
    borderColor: "rgba(216, 134, 255, 0.42)",
    iconBackgroundColor: "rgba(151, 54, 255, 0.16)"
  },
  {
    title: "Live Sync",
    body: "Updates in real time.",
    icon: "radio-outline",
    color: "#FF7DE3",
    backgroundColor: "rgba(242, 58, 205, 0.09)",
    borderColor: "rgba(255, 125, 227, 0.42)",
    iconBackgroundColor: "rgba(242, 58, 205, 0.14)"
  },
  {
    title: "Access whenever",
    body: "Open projects anytime.",
    icon: "phone-portrait-outline",
    color: "#A76DFF",
    backgroundColor: "rgba(109, 59, 255, 0.1)",
    borderColor: "rgba(167, 109, 255, 0.44)",
    iconBackgroundColor: "rgba(109, 59, 255, 0.16)"
  }
];
