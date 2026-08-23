import Ionicons from "@expo/vector-icons/Ionicons";

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
    color: "#7490FF",
    backgroundColor: "rgba(91, 124, 250, 0.09)",
    borderColor: "rgba(91, 124, 250, 0.42)",
    iconBackgroundColor: "rgba(91, 124, 250, 0.16)"
  },
  {
    title: "Live Sync",
    body: "Updates in real time.",
    icon: "radio-outline",
    color: "#7490FF",
    backgroundColor: "rgba(91, 124, 250, 0.09)",
    borderColor: "rgba(91, 124, 250, 0.42)",
    iconBackgroundColor: "rgba(91, 124, 250, 0.14)"
  },
  {
    title: "Access whenever",
    body: "Open projects anytime.",
    icon: "phone-portrait-outline",
    color: "#7490FF",
    backgroundColor: "rgba(91, 124, 250, 0.1)",
    borderColor: "rgba(91, 124, 250, 0.44)",
    iconBackgroundColor: "rgba(91, 124, 250, 0.16)"
  }
];
