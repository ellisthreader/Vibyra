import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import { useAppContext } from "../../../context/AppContext";
import { useThemedColor } from "../../../context/PreferencesContext";
import { projectFilterModes } from "../data/pages";
import { ProjectsPageProps, useProjectsPage } from "../hooks/useProjectsPage";
import { styles } from "../styles";
import { ProjectCard, ProjectDeleteConfirmModal, ProjectFilterMenuItem } from "./index";
import { FolderBrowserModal } from "./FolderBrowserModal";

export function ProjectsPage(props: ProjectsPageProps) {
  const p = useProjectsPage(props);
  const app = useAppContext();
  const browsePcIconColor = useThemedColor("#E8E2FF");
  const [pcBrowserOpen, setPcBrowserOpen] = useState(false);

  return (
    <View style={styles.projectsScreen}>
      <View style={styles.projectsHero}>
        <Pressable style={({ pressed }) => [styles.projectsCreateButton, pressed ? styles.projectsCreateButtonPressed : null]} onPress={p.createProject}>
          <LinearGradient colors={["#6630FF", "#7433FF", "#6425E6"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.projectsCreateGradient}>
            <Ionicons name="add" color={colors.text} size={p.projectLayout.createIconSize} />
            <Text numberOfLines={1} style={styles.projectsCreateText}>Create Project</Text>
          </LinearGradient>
        </Pressable>
        {props.connected ? (
          <Pressable style={({ pressed }) => [styles.projectsBrowsePcButton, pressed ? styles.projectsBrowsePcButtonPressed : null]} onPress={() => setPcBrowserOpen(true)}>
            <Ionicons name="search-outline" color={browsePcIconColor} size={18} />
            <Text numberOfLines={1} style={styles.projectsBrowsePcText}>Browse PC</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.projectsSearchRow, p.filterMenuOpen ? styles.projectsSearchRowMenuOpen : null]}>
        <View style={styles.projectsSearchBar}>
          <Ionicons name="search-outline" color="#8E8AA3" size={22} />
          <TextInput value={props.projectSearch} onChangeText={props.onSearch} placeholder="Search projects..." placeholderTextColor="#8E8AA3" style={styles.projectsSearchInput} />
        </View>
        {props.connected ? (
          <View style={styles.projectsFilterWrap}>
            <Pressable style={[styles.projectsFilterButton, p.filterMode !== "All" ? styles.projectsFilterButtonActive : null]} onPress={p.toggleFilterMenu}>
              <Ionicons name="options-outline" color={p.filterMenuOpen ? "#F1ECFF" : "#B4B1C9"} size={22} />
            </Pressable>
            {p.filterMenuOpen ? (
              <View style={styles.projectsFilterMenu}>
                {projectFilterModes.map((mode) => (
                  <ProjectFilterMenuItem key={mode} active={p.filterMode === mode} label={mode} onPress={() => p.selectFilterMode(mode)} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {props.connected ? (
        <Text style={styles.projectsFilterLabel}>
          Showing {p.filterMode === "All" ? "all" : p.filterMode === "PC" ? "PC" : "mobile"} projects
        </Text>
      ) : null}

      <View style={styles.projectsList}>
        {p.displayProjects.map((project, index) => (
          <ProjectCard
            key={`${project.id}-${index}`}
            active={p.openedProjectId === project.id || project.sourceProject?.id === props.selectedProjectId}
            menuOpen={p.menuProjectId === project.id}
            onCancelRename={p.cancelRenameProject}
            onChangeRename={p.setRenameDraft}
            onArchive={() => p.archiveProject(project.id)}
            onDelete={() => p.requestDeleteProject(project)}
            onMore={() => p.toggleProjectMenu(project.id)}
            onOpen={() => p.openProject(project)}
            onStartRename={() => p.startRenameProject(project)}
            onSubmitRename={() => p.submitRenameProject(project.id)}
            layout={p.projectLayout}
            project={project}
            renameValue={p.renameDraft}
            renaming={p.renamingProjectId === project.id}
          />
        ))}
        {p.displayProjects.length === 0 ? (
          <View style={styles.projectsEmptyState}>
            <Ionicons name="folder-open-outline" color="#8E8AA3" size={24} />
            <Text style={styles.projectsEmptyText}>No projects match this view.</Text>
          </View>
        ) : null}
      </View>
      <ProjectDeleteConfirmModal onCancel={p.cancelDeleteProject} onConfirm={p.confirmDeleteProject} project={p.deleteTarget} />
      <FolderBrowserModal
        browseDesktopPath={app.browseDesktopPath}
        label="Browse PC"
        onClose={() => setPcBrowserOpen(false)}
        onSelect={async (folder) => {
          setPcBrowserOpen(false);
          await app.adoptProject(folder);
          props.onOpenProjectPreview(folder.id, folder.name);
        }}
        visible={pcBrowserOpen}
      />
    </View>
  );
}
