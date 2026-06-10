import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { projectFilterModes } from "../data/pages";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { useProjectPublishStatuses } from "../hooks/useProjectPublishStatuses";
import { ProjectsPageProps, useProjectsPage } from "../hooks/useProjectsPage";
import { styles } from "../styles";
import { ProjectCard } from "./chunk20";
import { ProjectFilterMenuItem } from "./chunk21";
import { FolderBrowserModal } from "./FolderBrowserModal";
import { ProjectPublishModal } from "./ProjectPublishModal";
import { useProjectPublishFlow } from "./ProjectPublishFlow";
import { ProjectPublishNotice } from "./ProjectPublishNotice";
export function ProjectsPage(props: ProjectsPageProps) {
  const p = useProjectsPage(props);
  const app = useAppContext();
  const prefs = usePreferences();
  const publishStatuses = useProjectPublishStatuses(app.authToken);
  const browsePcIconColor = useThemedColor("#E8E2FF");
  const searchIconColor = useThemedColor("#8E8AA3");
  const filterIconColor = useThemedColor(p.filterMenuOpen ? "#F1ECFF" : "#B4B1C9");
  const createGradient = prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#6630FF", "#7433FF", "#6425E6"] as const;
  const [pcBrowserOpen, setPcBrowserOpen] = useState(false);
  const publish = useProjectPublishFlow(app, publishStatuses);
  useEffect(() => {
    if (!props.publishProjectId) return;
    const project = p.displayProjects.find((item) => item.id === props.publishProjectId || item.sourceProject?.id === props.publishProjectId);
    if (!project) return;
    publish.open(project);
    props.onPublishRequestHandled?.();
  }, [p.displayProjects, props.onPublishRequestHandled, props.publishProjectId, publish.open]);
  return (
    <View style={styles.projectsScreen}>
      <View style={styles.projectsHero}>
        <Pressable style={({ pressed }) => [styles.projectsCreateButton, pressed ? styles.projectsCreateButtonPressed : null]} onPress={p.createProject}>
          <LinearGradient colors={createGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.projectsCreateGradient}>
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
      <ProjectPublishNotice notice={publish.target ? null : publish.result} onDone={() => publish.setResult(null)} />
      <View style={[styles.projectsSearchRow, p.filterMenuOpen ? styles.projectsSearchRowMenuOpen : null]}>
        <View style={styles.projectsSearchBar}>
          <Ionicons name="search-outline" color={searchIconColor} size={22} />
          <TextInput value={props.projectSearch} onChangeText={props.onSearch} placeholder="Search projects..." placeholderTextColor={searchIconColor} style={styles.projectsSearchInput} />
        </View>
        {props.connected ? (
          <View style={styles.projectsFilterWrap}>
            <Pressable style={[styles.projectsFilterButton, p.filterMode !== "All" ? styles.projectsFilterButtonActive : null]} onPress={p.toggleFilterMenu}>
              <Ionicons name="options-outline" color={filterIconColor} size={22} />
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
            onMore={() => p.toggleProjectMenu(project.id)}
            onOpen={() => p.openProject(project)}
            onPublish={() => {
              if (p.menuProjectId === project.id) p.toggleProjectMenu(project.id);
              publish.open(project);
            }}
            onSubmitRename={() => p.submitRenameProject(project.id)}
            onTogglePin={() => p.togglePinProject(project.id)}
            layout={p.projectLayout}
            project={project}
            publishStatus={publishStatuses.items[project.sourceProject?.id ?? project.id]}
            renameValue={p.renameDraft}
            renaming={p.renamingProjectId === project.id}
          />
        ))}
        {p.displayProjects.length === 0 ? (
          <View style={styles.projectsEmptyState}>
            <Ionicons name="folder-open-outline" color={searchIconColor} size={24} />
            <Text style={styles.projectsEmptyText}>No projects match this view.</Text>
          </View>
        ) : null}
      </View>
      <ProjectPublishModal
        busy={publish.busy} error={publish.error} generating={publish.generating}
        onClose={publish.close} onDeleteListing={publish.remove} onGenerateAsset={publish.generate}
        onPublishRelease={publish.publish} onResultComplete={publish.complete}
        onSaveListing={publish.save} progress={publish.progress} project={publish.target}
        publishStatus={publish.status} result={publish.result}
      />
      <FolderBrowserModal
        browseDesktopPath={app.browseDesktopPath}
        label="Browse PC"
        onClose={() => setPcBrowserOpen(false)}
        onSelect={async (folder) => {
          setPcBrowserOpen(false);
          props.onOpenProjectPreview(folder.id, folder.name);
          const analyzed = await runFirstOpenDesktopAnalysis(app, folder);
          await app.adoptProject(analyzed);
        }}
        visible={pcBrowserOpen}
      />
    </View>
  );
}
