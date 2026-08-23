import { StyleSheet } from "react-native";
import { onboardingStyleSources } from "./styles/onboardingStyleSources";

const rawStyles = Object.assign(
  {},
  ...onboardingStyleSources.map(({ styles: sourceStyles }) => sourceStyles)
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const styles: any = StyleSheet.create(rawStyles as Parameters<typeof StyleSheet.create>[0]);
