import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { ActivityFeed } from "../components/ActivityFeed";
import { ChatPanel } from "../components/ChatPanel";
import { FilePanel } from "../components/FilePanel";
import { SectionHeader } from "../components/SectionHeader";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";

export function WorkspaceScreen() {
  const app = useAppContext();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboard}
    >
      <ScrollView style={styles.simpleScreen} contentContainerStyle={styles.simpleContent}>
        <WorkspaceHeader
          onCreateProject={app.createProject}
          onSelectProject={app.selectProject}
          projects={app.projects}
          selectedProject={app.selectedProject}
        />
        <FilePanel
          files={app.files}
          newFilePath={app.newFilePath}
          onCreateFile={app.createFile}
          onFilePathChange={app.setNewFilePath}
          onSelectFile={app.selectFile}
          selectedFileId={app.selectedFile.id}
        />
        <ChatPanel
          agentRequesting={app.agentRequesting}
          chatMessages={app.chatMessages}
          onStart={app.startAgent}
          reasoningEffort={app.reasoningEffort}
          selectedFile={app.selectedFile}
          selectedModel={app.selectedModel}
          setReasoningEffort={app.setReasoningEffort}
          setSelectedModel={app.setSelectedModel}
          setTaskText={app.setTaskText}
          taskText={app.taskText}
        />
        <View style={styles.simplePanel}>
          <SectionHeader title="Activity" />
          <ActivityFeed logs={app.logs.slice(0, 8)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  simpleContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 40
  },
  simplePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  simpleScreen: {
    flex: 1
  }
});
