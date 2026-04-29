import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { IconButton } from "./Buttons";
import { VibyraLogo } from "./VibyraLogo";
import { colors } from "../styles/theme";
import { Project } from "../types/domain";

type Props = {
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  selectedProject: Project;
};

export function WorkspaceHeader({ onCreateProject, onSelectProject, projects, selectedProject }: Props) {
  return (
    <>
      <View style={styles.simpleHeader}>
        <View style={styles.brandRow}>
          <VibyraLogo compact />
          <View>
            <Text style={styles.eyebrow}>Vibyra Workspace</Text>
            <Text style={styles.simpleTitle}>{selectedProject.name}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.rowDim}>{selectedProject.path}</Text>
          <IconButton icon="add-outline" label="New Project" onPress={onCreateProject} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simpleChips}>
        {projects.map((project) => {
          const active = project.id === selectedProject.id;
          return (
            <Pressable
              key={project.id}
              onPress={() => onSelectProject(project.id)}
              style={[styles.fileChip, active ? styles.fileChipActive : null]}
            >
              <Ionicons name="folder-outline" color={active ? colors.text : colors.muted} size={16} />
              <Text style={[styles.fileChipText, active ? styles.text : null]}>{project.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.magenta,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  fileChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10
  },
  fileChipActive: {
    backgroundColor: colors.magentaSoft,
    borderColor: colors.magenta
  },
  fileChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  rowDim: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "600"
  },
  brandRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8
  },
  simpleChips: {
    gap: 8,
    paddingBottom: 4
  },
  simpleHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  simpleTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800"
  },
  text: {
    color: colors.text
  }
});
