import { Ionicons } from "@expo/vector-icons";

export type AuthMethod = "apple" | "google" | "email";
export type IconName = keyof typeof Ionicons.glyphMap;

export const featureItems = [
  { title: "Beautiful", body: "by design", symbol: "braces" },
  { title: "Fast", body: "by nature", icon: "flash-outline" },
  { title: "Code", body: "anywhere", icon: "globe-outline" }
] satisfies Array<{ title: string; body: string; symbol?: "braces"; icon?: IconName }>;

export const logoAspectRatio = 515 / 375;
