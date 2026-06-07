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
  connectedAbove,
  bottomOffset,
  onHeightChange,
  onOpenChange,
  onSubmit
}: {
  agentRequesting: boolean;
  app: GeneratedApp;
  connectedAbove?: boolean;
  bottomOffset: number;
  onHeightChange?: (height: number) => void;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (prompt: string) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [commandBlocked, setCommandBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const secondaryIcon = useThemedColor("#A7A1B7");
  const inputPlaceholder = useThemedColor("#8D879D");
  const busy = agentRequesting || submitting;
  const trimmed = draft.trim();

  useEffect(() => {
    setOpen(false);
    onOpenChange?.(false);
    setDraft("");
    setCommandBlocked(false);
    setSubmitting(false);
  }, [app.id, onOpenChange]);

  function setChatOpen(value: boolean) {
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
        onPress={() => setChatOpen(true)}
        style={({ pressed }) => [
          miniStyles.trigger,
          { bottom: bottomOffset },
          pressed ? miniStyles.pressed : null
        ]}
      >
        <Ionicons name="sparkles" color="#FFFFFF" size={16} />
        <Text style={miniStyles.triggerText}>Ask AI</Text>
      </Pressable>
    );
  }

  return (
    <View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[miniStyles.container, { bottom: bottomOffset }]}
    >
      <View style={[miniStyles.composer, connectedAbove ? miniStyles.composerConnected : null]}>
        <Pressable
          accessibilityLabel="Close preview AI chat"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setChatOpen(false)}
          style={({ pressed }) => [miniStyles.close, pressed ? miniStyles.pressed : null]}
        >
          <Ionicons name="chevron-down" color={secondaryIcon} size={19} />
        </Pressable>
        <TextInput
          autoFocus
          editable={!busy}
          multiline
          onChangeText={(value) => { setDraft(value); if (commandBlocked) setCommandBlocked(false); }}
          onSubmitEditing={submit}
          placeholder="Ask for a change..."
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
    alignItems: "center", alignSelf: "center", height: 40, justifyContent: "center", width: 38
  },
  composer: {
    alignItems: "flex-end", backgroundColor: "rgba(7,9,17,0.97)", borderColor: "rgba(142,60,255,0.42)",
    borderRadius: 18, borderWidth: 1, flexDirection: "row", minHeight: 54,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.28,
    shadowRadius: 24
  },
  composerConnected: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0,
    shadowOpacity: 0
  },
  container: {
    left: 14, position: "absolute", right: 14, zIndex: 20
  },
  input: {
    color: "#FFFFFF", flex: 1, fontSize: 14, lineHeight: 19, maxHeight: 94, minHeight: 42,
    paddingHorizontal: 0, paddingRight: 8, paddingVertical: 10
  },
  note: { color: "#A7A1B7", fontSize: 12, fontWeight: "700", marginLeft: 8, marginTop: 7 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  send: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 12,
    height: 42, justifyContent: "center", marginBottom: 5, marginRight: 5, width: 42
  },
  sendDisabled: { backgroundColor: "rgba(255,255,255,0.12)" },
  trigger: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 7, minHeight: 44,
    paddingHorizontal: 15, position: "absolute", right: 16, shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 16, zIndex: 20
  },
  triggerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }
});
