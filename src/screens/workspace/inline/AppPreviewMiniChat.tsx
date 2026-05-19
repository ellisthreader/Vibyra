import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { GeneratedApp } from "../../../types/domain";
import { createThemedStyleSheet } from "../styles/themeTransform";
import { matchChatCommand } from "../data/chatCommands";

export function AppPreviewMiniChat({
  agentRequesting,
  app,
  bottomOffset,
  onOpenChange,
  onSubmit
}: {
  agentRequesting: boolean;
  app: GeneratedApp;
  bottomOffset: number;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (prompt: string) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [commandBlocked, setCommandBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const closeIcon = useThemedColor("#C8C1D8");
  const inputPlaceholder = useThemedColor("#8D879D");
  const sparkleIcon = useThemedColor("#D9CCFF");
  const busy = agentRequesting || submitting;
  const trimmed = draft.trim();

  useEffect(() => {
    setOpen(false);
    onOpenChange?.(false);
    setDraft("");
    setCommandBlocked(false);
    setSubmitting(false);
  }, [app.id, onOpenChange]);

  function setPanelOpen(value: boolean) {
    setOpen(value);
    onOpenChange?.(value);
  }

  async function submit() {
    if (!trimmed || busy) return;
    if (matchChatCommand(trimmed)) {
      setCommandBlocked(true);
      return;
    }
    const prompt = buildPreviewPrompt(app, trimmed);
    setCommandBlocked(false);
    setSubmitting(true);
    setDraft("");
    setPanelOpen(false);
    try {
      await onSubmit(prompt);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        accessibilityLabel="Open preview AI chat"
        accessibilityRole="button"
        onPress={() => setPanelOpen(true)}
        style={({ pressed }) => [miniStyles.fab, { bottom: bottomOffset }, pressed ? miniStyles.pressed : null]}
      >
        <Ionicons name="chatbubble-ellipses" color="#FFFFFF" size={22} />
      </Pressable>
    );
  }

  return (
    <View style={[miniStyles.panel, { bottom: bottomOffset }]}>
      <View style={miniStyles.header}>
        <View style={miniStyles.titleRow}>
          <View style={miniStyles.titleIcon}>
            <Ionicons name="sparkles-outline" color={sparkleIcon} size={15} />
          </View>
          <View style={miniStyles.titleCopy}>
            <Text style={miniStyles.title}>Preview AI</Text>
            <Text numberOfLines={1} style={miniStyles.subtitle}>{busy ? "Updating preview" : "Ask for a quick change"}</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Close preview AI chat" hitSlop={8} onPress={() => setPanelOpen(false)} style={miniStyles.close}>
          <Ionicons name="close" color={closeIcon} size={18} />
        </Pressable>
      </View>
      <View style={miniStyles.composer}>
        <TextInput
          editable={!busy}
          multiline
          onChangeText={(value) => { setDraft(value); if (commandBlocked) setCommandBlocked(false); }}
          onSubmitEditing={submit}
          placeholder="Describe the change..."
          placeholderTextColor={inputPlaceholder}
          returnKeyType="send"
          style={miniStyles.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Send preview change"
          accessibilityRole="button"
          disabled={!trimmed || busy}
          onPress={submit}
          style={({ pressed }) => [
            miniStyles.send,
            (!trimmed || busy) ? miniStyles.sendDisabled : null,
            pressed ? miniStyles.pressed : null
          ]}
        >
          <Ionicons name={busy ? "hourglass-outline" : "arrow-up"} color="#FFFFFF" size={17} />
        </Pressable>
      </View>
      {commandBlocked ? <Text style={miniStyles.note}>Use slash commands in the full chat.</Text> : null}
    </View>
  );
}

function buildPreviewPrompt(app: GeneratedApp, request: string) {
  const base = [
    `Make this change to the runnable preview for "${app.title}": ${request}`,
    "Keep the existing app idea and change only what is needed for the preview."
  ];
  const html = app.html?.trim();
  if (html) {
    base.push("Current preview HTML:", html.slice(0, 6000));
  }
  return base.join("\n");
}

const miniStyles = createThemedStyleSheet({
  close: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10, borderWidth: 1, height: 34, justifyContent: "center", width: 34
  },
  composer: {
    alignItems: "flex-end", backgroundColor: "rgba(255,255,255,0.055)", borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14, borderWidth: 1, flexDirection: "row", minHeight: 50, paddingLeft: 13
  },
  fab: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999, borderWidth: 1, elevation: 10, height: 52, justifyContent: "center",
    position: "absolute", right: 18, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28, shadowRadius: 16, width: 52, zIndex: 20
  },
  header: {
    alignItems: "center", flexDirection: "row", justifyContent: "space-between",
    marginBottom: 10
  },
  input: {
    color: "#FFFFFF", flex: 1, fontSize: 14, lineHeight: 19, maxHeight: 94, minHeight: 42,
    paddingHorizontal: 0, paddingRight: 9, paddingVertical: 10
  },
  note: { color: "#A7A1B7", fontSize: 12, fontWeight: "700", marginTop: 8 },
  panel: {
    backgroundColor: "rgba(7, 9, 17, 0.97)", borderColor: "rgba(142,60,255,0.42)",
    borderRadius: 20, borderWidth: 1, left: 14, padding: 12, position: "absolute",
    right: 14, shadowColor: "#000000", shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28, shadowRadius: 24, zIndex: 20
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  send: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 12,
    height: 40, justifyContent: "center", marginBottom: 5, marginRight: 5, width: 40
  },
  sendDisabled: { backgroundColor: "rgba(255,255,255,0.12)" },
  subtitle: { color: "#A7A1B7", fontSize: 11, fontWeight: "800", marginTop: 1 },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  titleCopy: { flex: 1, minWidth: 0 },
  titleIcon: {
    alignItems: "center", backgroundColor: "rgba(142,60,255,0.16)", borderRadius: 10,
    height: 30, justifyContent: "center", width: 30
  },
  titleRow: { alignItems: "center", flex: 1, flexDirection: "row", gap: 9, minWidth: 0 }
});
