import { StyleSheet } from "react-native";
import { welcome1 } from "./styles/welcome1";
import { welcome2 } from "./styles/welcome2";
import { welcome3 } from "./styles/welcome3";
import { welcome4 } from "./styles/welcome4";
import { welcome5 } from "./styles/welcome5";
import { welcome6 } from "./styles/welcome6";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const styles: any = StyleSheet.create({
  ...welcome1, ...welcome2, ...welcome3, ...welcome4, ...welcome5, ...welcome6
} as Parameters<typeof StyleSheet.create>[0]);
