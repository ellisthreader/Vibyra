import { useEffect, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Project } from "../../../types/domain";
import { projectFilterModes } from "../data/pages";
import { getProjectsLayout } from "../helpers/projectsLayout";
import { ProjectDisplay, ProjectStatus } from "../types";

export type ProjectsPageProps = {
  connected: boolean;
  desktopFolders: Project[];
  filteredProjects: Project[];
  onCreateProject: () => Promise<void>;
  onOpenProjectPreview: (projectId: string, projectName: string) => void;
  onPublishRequestHandled?: () => void;
  onScrollNeededChange: (needed: boolean) => void;
  onSearch: (value: string) => void;
  projectSearch: string;
  publishProjectId?: string | null;
  selectedProjectId: string;
};

function isPcProject(project: Project) {
  return (project.source ?? "pc") === "pc" || project.source === "desktop";
}

function getProjectStatus(project: Project): ProjectStatus {
  return isPcProject(project) ? "On PC" : "On mobile";
}

export function useProjectsPage(props: ProjectsPageProps) {
  const { height, width } = useWindowDimensions();
  const projectLayout = useMemo(() => getProjectsLayout(width, height), [height, width]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDisplay | null>(null);
  const [filterMode, setFilterMode] = useState<typeof projectFilterModes[number]>("All");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [archivedProjectIds, setArchivedProjectIds] = useState<string[]>([]);
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>([]);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!props.connected && filterMode !== "All") { setFilterMode("All"); setFilterMenuOpen(false); }
  }, [props.connected, filterMode]);

  const sourceFilteredProjects = useMemo(() => {
    if (!props.connected) return props.filteredProjects;
    if (filterMode === "PC") return props.filteredProjects.filter(isPcProject);
    if (filterMode === "Mobile") return props.filteredProjects.filter((p) => p.source === "mobile");
    return props.filteredProjects;
  }, [props.connected, props.filteredProjects, filterMode]);

  const includedDesktopFolders = useMemo(() => {
    if (!props.connected || filterMode === "Mobile") return [];
    const known = new Set(props.filteredProjects.map((p) => p.path));
    return props.desktopFolders.filter((f) => !known.has(f.path));
  }, [props.connected, props.desktopFolders, props.filteredProjects, filterMode]);

  const combined = useMemo(() => [...sourceFilteredProjects, ...includedDesktopFolders], [includedDesktopFolders, sourceFilteredProjects]);

  const displayProjects = combined
    .filter((project) => !archivedProjectIds.includes(project.id))
    .map((project): ProjectDisplay => ({
      id: project.id, name: project.name, path: project.path,
      pinned: pinnedProjectIds.includes(project.id),
      sourceProject: project, stack: project.stack,
      status: getProjectStatus(project),
      updated: `Updated ${project.updated}`
    }))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const estimatedCardHeight = width <= 375 ? 134 : width <= 393 ? 130 : 122;
  const estimatedProjectsHeight = 182 + 44 + 18 + 18 + 14 * 4 + displayProjects.length * estimatedCardHeight + Math.max(displayProjects.length - 1, 0) * 12;
  const availableProjectsHeight = height - 74 - 88;

  useEffect(() => { props.onScrollNeededChange(estimatedProjectsHeight > availableProjectsHeight); }, [availableProjectsHeight, estimatedProjectsHeight, props.onScrollNeededChange]);

  const selectFilterMode = (mode: typeof projectFilterModes[number]) => { setFilterMode(mode); setFilterMenuOpen(false); };
  const createProject = () => { setFilterMenuOpen(false); setMenuProjectId(null); setRenamingProjectId(null); void props.onCreateProject(); };
  const openProject = (project: ProjectDisplay) => {
    setOpenedProjectId(project.id); setFilterMenuOpen(false); setMenuProjectId(null); setRenamingProjectId(null);
    props.onOpenProjectPreview(project.sourceProject?.id ?? project.id, project.name);
  };
  const archiveProject = (id: string) => {
    setArchivedProjectIds((current) => current.includes(id) ? current : [...current, id]);
    setMenuProjectId(null);
  };
  const togglePinProject = (id: string) => {
    setPinnedProjectIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setMenuProjectId(null);
  };
  const requestDeleteProject = (_p: ProjectDisplay) => { setDeleteTarget(null); setFilterMenuOpen(false); setMenuProjectId(null); setRenamingProjectId(null); };
  const confirmDeleteProject = () => { setDeleteTarget(null); };
  const cancelDeleteProject = () => setDeleteTarget(null);
  const startRenameProject = (_p: ProjectDisplay) => { setRenameDraft(""); setFilterMenuOpen(false); setRenamingProjectId(null); setMenuProjectId(null); };
  const submitRenameProject = (_id: string) => {
    setRenamingProjectId(null); setRenameDraft("");
  };
  const cancelRenameProject = () => { setRenamingProjectId(null); setRenameDraft(""); };
  const toggleProjectMenu = (id: string) => setMenuProjectId((c) => c === id ? null : id);
  const toggleFilterMenu = () => setFilterMenuOpen((c) => !c);

  return {
    projectLayout, displayProjects, deleteTarget,
    filterMode, filterMenuOpen, menuProjectId, openedProjectId, renamingProjectId, renameDraft,
    setRenameDraft,
    selectFilterMode, createProject, openProject, archiveProject, togglePinProject, requestDeleteProject,
    confirmDeleteProject, cancelDeleteProject, startRenameProject, submitRenameProject,
    cancelRenameProject, toggleProjectMenu, toggleFilterMenu
  };
}
