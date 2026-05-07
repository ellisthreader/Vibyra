import { StyleSheet } from "react-native";
import { part1 } from "./styles/part1";
import { part2 } from "./styles/part2";
import { part3 } from "./styles/part3";
import { part4 } from "./styles/part4";
import { part5 } from "./styles/part5";
import { part6 } from "./styles/part6";
import { part7 } from "./styles/part7";
import { part8 } from "./styles/part8";
import { part9 } from "./styles/part9";
import { part10 } from "./styles/part10";
import { part11 } from "./styles/part11";
import { part12 } from "./styles/part12";
import { part13 } from "./styles/part13";
import { part14 } from "./styles/part14";
import { part15 } from "./styles/part15";
import { part16 } from "./styles/part16";
import { part17 } from "./styles/part17";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const styles: any = StyleSheet.create({
  ...part1, ...part2, ...part3, ...part4, ...part5, ...part6,
  ...part7, ...part8, ...part9, ...part10, ...part11, ...part12,
  ...part13, ...part14, ...part15, ...part16, ...part17
} as Parameters<typeof StyleSheet.create>[0]);
