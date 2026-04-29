import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SectionHeader } from "./SectionHeader";
import { colors } from "../styles/theme";
import { FileEntry } from "../types/domain";

type Props = {
  files: FileEntry[];
  newFilePath: string;
  onCreateFile: () => void;
  onFilePathChange: (path: string) => void;
  onSelectFile: (fileId: string) => void;
  selectedFileId: string;
};

export function FilePanel(props: Props) {
  return (
    <View style={styles.simplePanel}>
      <SectionHeader title="Files" />
      <View style={styles.simpleCreateRow}>
        <TextInput
          value={props.newFilePath}
          onChangeText={props.onFilePathChange}
          placeholder="new-file.txt"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.simpleFileInput]}
        />
        <TouchableOpacity style={styles.simpleIconButton} onPress={props.onCreateFile} activeOpacity={0.86}>
          <Ionicons name="add-outline" color={colors.text} size={22} />
        </TouchableOpacity>
      </View>
      <FileList files={props.files} selectedFileId={props.selectedFileId} onSelectFile={props.onSelectFile} />
    </View>
  );
}

function FileList({ files, selectedFileId, onSelectFile }: Pick<Props, "files" | "selectedFileId" | "onSelectFile">) {
  if (files.length === 0) {
    return <Text style={styles.rowMeta}>No readable files yet.</Text>;
  }

  return (
    <View style={styles.simpleFileGrid}>
      {files.map((file) => {
        const active = file.id === selectedFileId;
        return (
          <Pressable
            key={file.id}
            onPress={() => onSelectFile(file.id)}
            style={[styles.simpleFileRow, active ? styles.simpleFileRowActive : null]}
          >
            <Ionicons name="document-text-outline" color={active ? colors.text : colors.muted} size={17} />
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{file.name}</Text>
              <Text style={styles.rowDim}>{file.path}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowDim: { color: colors.dim, fontSize: 12, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  simpleCreateRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  simpleFileGrid: { gap: 8, marginTop: 12 },
  simpleFileInput: { flex: 1, minHeight: 48 },
  simpleFileRow: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    padding: 12
  },
  simpleFileRowActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  simpleIconButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  simplePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  }
});
