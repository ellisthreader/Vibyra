import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { GeneratedApp } from "../../../types/domain";
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
  onSubmit: (prompt: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [commandBlocked, setCommandBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        <LinearGradient colors={["#A368FF", "#5D24D8"]} style={miniStyles.fabGradient}>
          <Ionicons name="chatbubble-ellipses" color="#FFFFFF" size={24} />
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <View style={[miniStyles.panel, { bottom: bottomOffset }]}>
      <View style={miniStyles.header}>
        <View style={miniStyles.titleRow}>
          <Ionicons name="sparkles-outline" color="#D7C4FF" size={16} />
          <Text style={miniStyles.title}>Preview edit</Text>
        </View>
        <Pressable accessibilityLabel="Close preview AI chat" hitSlop={8} onPress={() => setPanelOpen(false)} style={miniStyles.close}>
          <Ionicons name="close" color="#D9D4E8" size={18} />
        </Pressable>
      </View>
      <View style={miniStyles.inputRow}>
        <TextInput
          editable={!busy}
          multiline
          onChangeText={(value) => { setDraft(value); if (commandBlocked) setCommandBlocked(false); }}
          onSubmitEditing={submit}
          placeholder="Ask AI to change this preview..."
          placeholderTextColor="#9B96AA"
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
          <Ionicons name={busy ? "hourglass-outline" : "arrow-up"} color="#FFFFFF" size={18} />
        </Pressable>
      </View>
      {commandBlocked ? <Text style={miniStyles.note}>Slash commands are available in the full chat.</Text> : null}
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

const miniStyles = StyleSheet.create({
  close: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  fab: {
    borderRadius: 999, elevation: 10, position: "absolute", right: 18,
    shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 14, zIndex: 20
  },
  fabGradient: { alignItems: "center", borderRadius: 999, height: 56, justifyContent: "center", width: 56 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  input: {
    color: "#FFFFFF", flex: 1, fontSize: 14, maxHeight: 96, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 10
  },
  inputRow: {
    alignItems: "flex-end", backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)", borderRadius: 16,
    borderWidth: 1, flexDirection: "row"
  },
  note: { color: "#AAA6BC", fontSize: 12, fontWeight: "700", marginTop: 8 },
  panel: {
    backgroundColor: "rgba(10, 12, 20, 0.96)", borderColor: "rgba(163, 104, 255, 0.34)",
    borderRadius: 18, borderWidth: 1, left: 14, padding: 12,
    position: "absolute", right: 14, zIndex: 20
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  send: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 13,
    height: 42, justifyContent: "center", marginBottom: 3, marginRight: 3, width: 42
  },
  sendDisabled: { backgroundColor: "#393646" },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 7 }
});
