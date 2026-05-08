import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(style).catch(() => undefined);
}
