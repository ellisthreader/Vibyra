import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemedColor } from "../../../context/PreferencesContext";
import { createThemedStyleSheet } from "../styles/themeTransform";
import { colors } from "../../../styles/theme";
import type { DesktopBrowseEntry, DesktopBrowseListing, Project } from "../../../types/domain";

export function FolderBrowserModal({ browseDesktopPath, initialPath, label, onClose, onSelect, visible }: {
  browseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  initialPath?: string;
  label?: string;
  onClose: () => void;
  onSelect: (folder: Project) => void;
  visible: boolean;
}) {
  const [listing, setListing] = useState<DesktopBrowseListing>({ current: null, parentPath: null, entries: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const accentIcon = useThemedColor("#B084FF");
  const closeIcon = useThemedColor("#FFFFFF");
  const mutedIcon = useThemedColor("#A29CB8");
  const dimIcon = useThemedColor("#8F8A9E");
  const toolbarIcon = useThemedColor("#D5D0E6");
  const warningIcon = useThemedColor("#FFD166");
  const placeholderColor = useThemedColor("#7F788F");

  const browseRef = useRef(browseDesktopPath);
  browseRef.current = browseDesktopPath;

  const openPath = useCallback(async (path?: string) => {
    setLoading(true);
    setError("");
    try {
      const next = await browseRef.current(path);
      setListing(next);
      if (!next.current && next.entries.length === 0) {
        setError("I couldn't list folders from your PC. Check that Vibyra Desktop is connected.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "I couldn't list folders from your PC.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    openPath(initialPath);
  }, [initialPath, openPath, visible]);

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listing.entries.filter((entry) => !needle || entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle));
  }, [listing.entries, query]);
  const projectFromEntry = useCallback((entry: DesktopBrowseEntry): Project => {
    const { kind, ...project } = entry;
    return { ...project, stack: project.stack || "Folder", updated: project.updated || "Now", source: project.source ?? "desktop" };
  }, []);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={folderBrowserStyles.screen}>
        <View style={folderBrowserStyles.header}>
          <Pressable onPress={onClose} style={folderBrowserStyles.iconButton}>
            <Ionicons name="close" color={closeIcon} size={22} />
          </Pressable>
          <View style={folderBrowserStyles.titleStack}>
            <Text style={folderBrowserStyles.label}>{label ?? "Manual PC browse"}</Text>
            <Text numberOfLines={1} style={folderBrowserStyles.title}>{listing.current?.name ?? "Choose a location"}</Text>
          </View>
          <Pressable onPress={() => openPath(listing.current?.path)} style={folderBrowserStyles.iconButton}>
            <Ionicons name="refresh" color={closeIcon} size={20} />
          </Pressable>
        </View>

        <View style={folderBrowserStyles.pathBar}>
          <Ionicons name="desktop-outline" color={accentIcon} size={15} />
          <Text numberOfLines={1} style={folderBrowserStyles.pathText}>{listing.current?.name ?? "Your PC"}</Text>
        </View>

        <View style={folderBrowserStyles.searchRow}>
          <Ionicons name="search-outline" color={mutedIcon} size={16} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search visible folders"
            placeholderTextColor={placeholderColor}
            style={folderBrowserStyles.searchInput}
            value={query}
          />
        </View>

        <View style={folderBrowserStyles.toolbar}>
          <Pressable
            disabled={!listing.parentPath}
            onPress={() => listing.parentPath ? openPath(listing.parentPath) : undefined}
            style={({ pressed }) => [folderBrowserStyles.toolbarButton, !listing.parentPath && folderBrowserStyles.disabled, pressed && folderBrowserStyles.pressed]}
          >
            <Ionicons name="arrow-up" color={toolbarIcon} size={14} />
            <Text style={folderBrowserStyles.toolbarText}>Up</Text>
          </Pressable>
          {listing.current ? (
            <Pressable onPress={() => listing.current ? onSelect(listing.current) : undefined} style={({ pressed }) => [folderBrowserStyles.selectCurrentButton, pressed && folderBrowserStyles.pressed]}>
              <Ionicons name="checkmark" color="#FFFFFF" size={15} />
              <Text style={[folderBrowserStyles.selectCurrentText, { color: "#FFFFFF" }]}>Select this folder</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={folderBrowserStyles.errorBox}><Ionicons name="alert-circle-outline" color={warningIcon} size={15} /><Text style={folderBrowserStyles.errorText}>{error}</Text></View>
        ) : null}

        {loading ? (
          <View style={folderBrowserStyles.loading}>
            <ActivityIndicator color={accentIcon} />
            <Text style={folderBrowserStyles.loadingText}>Reading folders...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={folderBrowserStyles.listContent} style={folderBrowserStyles.list}>
            {visibleEntries.map((entry) => {
              const folder = entry.kind === "folder";
              return (
                <View key={entry.id} style={folderBrowserStyles.row}>
                  <Pressable
                    disabled={!folder}
                    onPress={() => folder ? openPath(entry.path) : undefined}
                    style={({ pressed }) => [folderBrowserStyles.rowMain, !folder && folderBrowserStyles.fileRow, pressed && folderBrowserStyles.rowPressed]}
                  >
                    <View style={folder ? folderBrowserStyles.folderIcon : folderBrowserStyles.fileIcon}>
                      <Ionicons name={folder ? "folder-outline" : "document-outline"} color={folder ? accentIcon : mutedIcon} size={18} />
                    </View>
                    <View style={folderBrowserStyles.rowText}>
                      <Text numberOfLines={1} style={folderBrowserStyles.rowName}>{entry.name}</Text>
                      <Text numberOfLines={1} style={folderBrowserStyles.rowPath}>{entry.kind === "folder" ? "Folder" : "File"}</Text>
                    </View>
                    {folder ? <Ionicons name="chevron-forward" color={dimIcon} size={16} /> : <Text style={folderBrowserStyles.fileChip}>File</Text>}
                  </Pressable>
                  {folder ? (
                    <Pressable onPress={() => onSelect(projectFromEntry(entry))} style={({ pressed }) => [folderBrowserStyles.rowSelect, pressed && folderBrowserStyles.pressed]}>
                      <Text style={folderBrowserStyles.rowSelectText}>Select folder</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {!visibleEntries.length ? (
              <Text style={folderBrowserStyles.emptyText}>No files or folders are visible here.</Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const folderBrowserStyles = createThemedStyleSheet({
  screen: { backgroundColor: "#0B0C12", flex: 1, padding: 16, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 14 },
  iconButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  titleStack: { flex: 1, minWidth: 0 },
  label: { color: "#8F8A9E", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 19, fontWeight: "900", marginTop: 2 },
  pathBar: { alignItems: "center", backgroundColor: "rgba(176, 132, 255, 0.1)", borderColor: "rgba(176, 132, 255, 0.2)", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 38, paddingHorizontal: 11 },
  pathText: { color: "#D5D0E6", flex: 1, fontSize: 12, fontWeight: "700" },
  searchRow: { alignItems: "center", backgroundColor: "#151621", borderColor: "rgba(255,255,255,0.09)", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 12, minHeight: 46, paddingHorizontal: 12 },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700", minWidth: 0 },
  toolbar: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginTop: 12 },
  toolbarButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.12)", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 36, paddingHorizontal: 12 },
  toolbarText: { color: "#D5D0E6", fontSize: 13, fontWeight: "800" },
  selectCurrentButton: { alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 999, flexDirection: "row", gap: 6, minHeight: 36, paddingHorizontal: 14 },
  selectCurrentText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  errorBox: { alignItems: "center", backgroundColor: "rgba(255, 209, 102, 0.09)", borderColor: "rgba(255, 209, 102, 0.22)", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 12, padding: 10 },
  errorText: { color: "#FFE1A3", flex: 1, fontSize: 12, fontWeight: "700" },
  loading: { alignItems: "center", flex: 1, gap: 10, justifyContent: "center" },
  loadingText: { color: "#A29CB8", fontSize: 13, fontWeight: "700" },
  list: { flex: 1, marginTop: 12 },
  listContent: { gap: 8, paddingBottom: 24 },
  row: { backgroundColor: "#151621", borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  rowMain: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 11, paddingVertical: 9 },
  rowPressed: { backgroundColor: "rgba(142, 60, 255, 0.1)" },
  folderIcon: { alignItems: "center", backgroundColor: "rgba(176, 132, 255, 0.14)", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  fileIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  fileRow: { opacity: 0.78 },
  fileChip: { color: "#8F8A9E", fontSize: 11, fontWeight: "900" },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  rowPath: { color: "#8F8A9E", fontSize: 11, fontWeight: "700", marginTop: 2 },
  rowSelect: { alignItems: "center", borderTopColor: "rgba(255,255,255,0.08)", borderTopWidth: 1, minHeight: 38, justifyContent: "center" },
  rowSelectText: { color: "#D7C4FF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.82 },
  emptyText: { color: "#8F8A9E", fontSize: 13, fontWeight: "700", padding: 18, textAlign: "center" }
});
