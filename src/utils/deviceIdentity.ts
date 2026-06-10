import Constants from "expo-constants";
import { Platform } from "react-native";

export function appDeviceName() {
  const nativeName = String(Constants.deviceName ?? "").trim();
  if (nativeName && !isUnknownDeviceName(nativeName)) return nativeName;
  if (Platform.OS === "ios") return Platform.isPad ? "iPad" : "iPhone";
  if (Platform.OS === "android") return "Android phone";
  if (Platform.OS === "web") return "Web browser";
  return "Vibyra device";
}

function isUnknownDeviceName(value: string) {
  return /^(unknown|null|undefined)$/i.test(value);
}
