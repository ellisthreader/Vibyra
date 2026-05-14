import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { generatePublishAsset, publishProject as publishCommunityProject } from "../../../utils/communityApi";
import { pickPreviewHtml } from "../../../utils/files";
import { projectFilterModes } from "../data/pages";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { ProjectsPageProps, useProjectsPage } from "../hooks/useProjectsPage";
import { styles } from "../styles";
import { ProjectDisplay } from "../types";
import { ProjectCard } from "./chunk20";
import { ProjectDeleteConfirmModal, ProjectFilterMenuItem } from "./chunk21";
import { FolderBrowserModal } from "./FolderBrowserModal";
import { ProjectPublishModal } from "./ProjectPublishModal";

export function ProjectsPage(props: ProjectsPageProps) {
  const p = useProjectsPage(props);
  const app = useAppContext();
  const prefs = usePreferences();
  const browsePcIconColor = useThemedColor("#E8E2FF");
  const searchIconColor = useThemedColor("#8E8AA3");
  const filterIconColor = useThemedColor(p.filterMenuOpen ? "#F1ECFF" : "#B4B1C9");
  const emptyIconColor = useThemedColor("#8E8AA3");
  const createGradient = prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#6630FF", "#7433FF", "#6425E6"] as const;
  const [pcBrowserOpen, setPcBrowserOpen] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishTarget, setPublishTarget] = useState<ProjectDisplay | null>(null);
  const [generatingAsset, setGeneratingAsset] = useState<"logo" | "screenshot" | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!props.publishProjectId) return;
    const project = p.displayProjects.find((item) => item.id === props.publishProjectId || item.sourceProject?.id === props.publishProjectId);
    if (!project) return;
    setPublishError("");
    setPublishTarget(project);
    props.onPublishRequestHandled?.();
  }, [p.displayProjects, props]);

  async function submitPublish(payload: { description: string; logoImageUrl: string; screenshotUrls: string[]; tags: string[]; title: string; visibility: "public" | "unlisted" | "private" }) {
    if (!publishTarget) return;
    if (!app.authToken) {
      setPublishError("Log in before publishing a project.");
      return;
    }
    setPublishing(true);
    setPublishError("");
    try {
      if (publishTarget.sourceProject && !app.projects.some((item) => item.id === publishTarget.id)) {
        await app.adoptProject(publishTarget.sourceProject);
      }
      const files = await app.selectProject(publishTarget.id, { startPreview: false });
      const previewHtml = pickPreviewHtml(files, false);
      const result = await publishCommunityProject({
        authToken: app.authToken,
        description: payload.description,
        logoImageUrl: payload.logoImageUrl,
        previewHtml,
        projectId: publishTarget.id,
        screenshotUrls: payload.screenshotUrls,
        stack: publishTarget.stack,
        tags: payload.tags,
        title: payload.title,
        visibility: payload.visibility
      });
      if (result.reviewStatus && result.reviewStatus !== "approved") return setPublishError("Submitted for review. It will appear in Community after approval.");
      if (payload.visibility !== "public" || result.isPublic === false) return setPublishError(`Saved as ${payload.visibility}. It will not appear in Community.`);
      setPublishTarget(null);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Project could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleGenerateAsset(kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) {
    if (!app.authToken) {
      setPublishError("Log in before generating publish images.");
      return null;
    }
    setGeneratingAsset(kind);
    setPublishError("");
    try {
      const result = await generatePublishAsset({ authToken: app.authToken, kind, ...payload });
      if (result.user) app.applyRemoteUserFromIap(result.user);
      return result.imageUrl;
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : `${kind} could not be generated.`);
      return null;
    } finally {
      setGeneratingAsset(null);
    }
  }

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
            onDelete={() => p.requestDeleteProject(project)}
            onMore={() => p.toggleProjectMenu(project.id)}
            onOpen={() => p.openProject(project)}
            onPublish={() => {
              if (p.menuProjectId === project.id) p.toggleProjectMenu(project.id);
              setPublishError("");
              setPublishTarget(project);
            }}
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
            <Ionicons name="folder-open-outline" color={emptyIconColor} size={24} />
            <Text style={styles.projectsEmptyText}>No projects match this view.</Text>
          </View>
        ) : null}
      </View>
      <ProjectDeleteConfirmModal onCancel={p.cancelDeleteProject} onConfirm={p.confirmDeleteProject} project={p.deleteTarget} />
      <ProjectPublishModal
        busy={publishing}
        error={publishError}
        generating={generatingAsset}
        onClose={() => { if (!publishing) setPublishTarget(null); }}
        onGenerateAsset={handleGenerateAsset}
        onPublish={submitPublish}
        project={publishTarget}
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
