import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createThemedStyleSheet } from "../styles/themeTransform";

type ActiveBlock = {
  language: string;
  inferredFile: string;
  lineCount: number;
};

export function LiveCodeActivityCard({ text }: { text: string }) {
  const block = parseActiveCodeBlock(text);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!block) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [block, pulse]);

  if (!block) return null;

  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["rgba(142, 60, 255, 0.16)", "rgba(57, 130, 255, 0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconRing, { opacity: ringOpacity }]} />
        <LinearGradient
          colors={["#8E3CFF", "#5D24D8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCore}
        >
          <Ionicons name="code-slash-outline" color="#FFFFFF" size={13} />
        </LinearGradient>
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>Generating</Text>
        <Text numberOfLines={1} style={styles.filename}>{block.inferredFile}</Text>
      </View>
      <View style={styles.counter}>
        <Text style={styles.counterValue}>{block.lineCount}</Text>
        <Text style={styles.counterUnit}>lines</Text>
      </View>
    </View>
  );
}

function parseActiveCodeBlock(text: string): ActiveBlock | null {
  if (!text) return null;
  const fenceMatches = Array.from(text.matchAll(/```([\w+.-]*)\s*([^\n]*)\n?/g));
  if (fenceMatches.length === 0 || fenceMatches.length % 2 === 0) return null;

  const last = fenceMatches[fenceMatches.length - 1];
  const fenceStart = (last.index ?? 0) + last[0].length;
  const body = text.slice(fenceStart);
  const language = (last[1] || "").toLowerCase();
  const inlineHint = (last[2] || "").trim();
  const lineCount = body.length === 0 ? 0 : body.split(/\r\n|\r|\n/).length;
  const inferredFile = inferFilename(language, inlineHint, body);
  return { language, inferredFile, lineCount };
}

function inferFilename(language: string, inlineHint: string, body: string): string {
  if (inlineHint) {
    const matched = inlineHint.match(/[\w./-]+\.[A-Za-z0-9]{1,8}/);
    if (matched) return matched[0];
  }
  const fileTokenMatch = body.match(/(?:\/\/|#|--)\s*([\w./-]+\.[A-Za-z0-9]{1,8})/);
  if (fileTokenMatch) return fileTokenMatch[1];
  const extension = extensionForLanguage(language);
  return extension ? `App.${extension}` : "code";
}

function extensionForLanguage(language: string): string {
  switch (language) {
    case "js":
    case "javascript":
      return "js";
    case "jsx":
      return "jsx";
    case "ts":
    case "typescript":
      return "ts";
    case "tsx":
      return "tsx";
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "py":
    case "python":
      return "py";
    case "sh":
    case "bash":
    case "shell":
      return "sh";
    case "php":
      return "php";
    case "md":
    case "markdown":
      return "md";
    default:
      return language && /^[a-z0-9]+$/.test(language) ? language : "";
  }
}

const styles = createThemedStyleSheet({
  card: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 26, 0.86)",
    borderColor: "rgba(176, 132, 255, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  iconWrap: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  iconRing: {
    backgroundColor: "rgba(142, 60, 255, 0.45)",
    borderRadius: 999,
    height: 28,
    position: "absolute",
    width: 28,
  },
  iconCore: {
    alignItems: "center",
    borderRadius: 8,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  body: { flex: 1, minWidth: 0 },
  kicker: { color: "#D7C4FF", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  filename: {
    color: "#FFFFFF",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 12.5,
    fontWeight: "800",
    marginTop: 1,
  },
  counter: { alignItems: "flex-end" },
  counterValue: {
    color: "#4EC07A",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    fontWeight: "900",
  },
  counterUnit: { color: "#8F8A9E", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
});
