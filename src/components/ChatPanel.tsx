import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SegmentedControl } from "./SegmentedControl";
import { models, reasoningEfforts } from "../data/appData";
import { colors } from "../styles/theme";
import { ChatMessage, FileEntry, ModelKey, ReasoningEffort } from "../types/domain";

type Props = {
  agentRequesting: boolean;
  chatMessages: ChatMessage[];
  onStart: () => void;
  reasoningEffort: ReasoningEffort;
  selectedFile: FileEntry;
  selectedModel: ModelKey;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (task: string) => void;
  taskText: string;
};

export function ChatPanel(props: Props) {
  return (
    <View style={styles.chatPanel}>
      <View style={styles.chatHeader}>
        <View>
          <Text style={styles.eyebrow}>Vibyra Agent</Text>
          <Text style={styles.chatTitle}>{props.selectedFile.name}</Text>
        </View>
        <Text style={styles.rowDim}>{props.selectedModel}</Text>
      </View>

      <ScrollView style={styles.chatThread} contentContainerStyle={styles.chatThreadContent}>
        {props.chatMessages.map((message) => <ChatBubble key={message.id} message={message} />)}
      </ScrollView>

      <View style={styles.filePreviewStrip}>
        <Text style={styles.rowTitle}>{props.selectedFile.path}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={styles.filePreviewText}>{props.selectedFile.body || "Tap a file to load its contents."}</Text>
        </ScrollView>
      </View>

      <View style={styles.chatControls}>
        <SegmentedControl selected={props.selectedModel} values={models} onChange={props.setSelectedModel} />
        <SegmentedControl selected={props.reasoningEffort} values={reasoningEfforts} onChange={props.setReasoningEffort} />
      </View>

      <View style={styles.chatComposer}>
        <TextInput
          value={props.taskText}
          onChangeText={props.setTaskText}
          placeholder="Message Vibyra about this file"
          placeholderTextColor={colors.dim}
          multiline
          style={styles.chatInput}
        />
        <TouchableOpacity style={styles.chatSendButton} onPress={props.onStart} activeOpacity={0.86}>
          <Ionicons name={props.agentRequesting ? "hourglass-outline" : "arrow-up"} color={colors.text} size={22} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  return (
    <View style={[styles.chatBubble, user ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
      {message.file ? <Text style={styles.chatFile}>{message.file}</Text> : null}
      <Text style={styles.chatText}>{message.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chatBubble: { borderRadius: 8, maxWidth: "92%", padding: 12 },
  chatBubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1
  },
  chatBubbleUser: { alignSelf: "flex-end", backgroundColor: colors.magenta },
  chatComposer: {
    alignItems: "flex-end",
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 8
  },
  chatControls: { gap: 8 },
  chatFile: { color: colors.dim, fontSize: 11, fontWeight: "800", marginBottom: 6 },
  chatHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  chatInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  chatPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  chatSendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  chatText: { color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  chatThread: { maxHeight: 430, minHeight: 280 },
  chatThreadContent: { gap: 10, paddingVertical: 4 },
  chatTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  eyebrow: { color: colors.magenta, fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  filePreviewStrip: {
    backgroundColor: "#050505",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    maxHeight: 120,
    padding: 10
  },
  filePreviewText: { color: "#E5E7EB", fontSize: 12, lineHeight: 18 },
  rowDim: { color: colors.dim, fontSize: 12, fontWeight: "600" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" }
});
