import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { diffCounts, SYNTAX_COLOR_SCHEMES, tokenize } from "../../../utils/syntaxHighlight";
import { styles } from "../styles";

export function CollapsibleCodeBlock({ language, filename, code, streaming, initialExpanded = false }: {
  language: string;
  filename: string;
  code: string;
  streaming: boolean;
  initialExpanded?: boolean;
}) {
  const prefs = usePreferences();
  const chevronColor = useThemedColor("#9E98AD");
  const [expanded, setExpanded] = useState(initialExpanded);
  const headerLabel = filename || (language ? language.toLowerCase() : "code");
  const detectedLanguage = language || extensionFor(filename);
  const counts = useMemo(() => diffCounts(code), [code]);
  const tokens = useMemo(
    () => (expanded ? tokenize(code, detectedLanguage) : []),
    [expanded, code, detectedLanguage]
  );

  return (
    <View style={styles.messageCodeBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} code for ${headerLabel}`}
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.messageCodeBlockHeader}
      >
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={14} color={chevronColor} />
        <Text style={styles.messageCodeBlockLang} numberOfLines={1}>{headerLabel}</Text>
        <View style={styles.messageCodeBlockCounts}>
          {counts.added > 0 ? <Text style={styles.messageCodeBlockAdded}>+{counts.added}</Text> : null}
          {counts.removed > 0 ? <Text style={styles.messageCodeBlockRemoved}>-{counts.removed}</Text> : null}
          {streaming ? <Text style={styles.messageCodeBlockStreaming}>writing…</Text> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.messageCodeBlockBody}>
          <Text style={styles.messageCodeBlockText}>
            {tokens.map((token, index) => <Text key={index} style={{ color: SYNTAX_COLOR_SCHEMES[prefs.effectiveScheme][token.kind] }}>{token.text}</Text>)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function extensionFor(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\\/g, "/");
  const name = clean.split("/").pop() ?? clean;
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
}
