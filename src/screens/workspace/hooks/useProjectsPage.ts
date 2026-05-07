import { useEffect, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Project } from "../../../types/domain";
import { projectFilterModes, projectStatuses } from "../data/pages";
import { getProjectsLayout } from "../helpers/projectsLayout";
import { ProjectDisplay } from "../types";

export type ProjectsPageProps = {
  connected: boolean;
  desktopFolders: Project[];
  filteredProjects: Project[];
  onCreateProject: () => Promise<void>;
  onOpenProjectPreview: (projectId: string, projectName: string) => void;
  onScrollNeededChange: (needed: boolean) => void;
  onSearch: (value: string) => void;
  projectSearch: string;
  selectedProjectId: string;
};

export function useProjectsPage(props: ProjectsPageProps) {
  const { height, width } = useWindowDimensions();
  const projectLayout = useMemo(() => getProjectsLayout(width, height), [height, width]);
  const [archivedProjectIds, setArchivedProjectIds] = useState<Set<string>>(() => new Set());
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<ProjectDisplay | null>(null);
  const [filterMode, setFilterMode] = useState<typeof projectFilterModes[number]>("All");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [renamedProjectNames, setRenamedProjectNames] = useState<Record<string, string>>({});
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!props.connected && filterMode !== "All") { setFilterMode("All"); setFilterMenuOpen(false); }
  }, [props.connected, filterMode]);

  const sourceFilteredProjects = useMemo(() => {
    if (!props.connected) return props.filteredProjects;
    if (filterMode === "PC") return props.filteredProjects.filter((p) => (p.source ?? "pc") === "pc");
    if (filterMode === "Mobile") return props.filteredProjects.filter((p) => p.source === "mobile");
    return props.filteredProjects;
  }, [props.connected, props.filteredProjects, filterMode]);

  const includedDesktopFolders = useMemo(() => {
    if (!props.connected || filterMode !== "All") return [];
    const known = new Set(props.filteredProjects.map((p) => p.path));
    return props.desktopFolders.filter((f) => !known.has(f.path));
  }, [props.connected, props.desktopFolders, props.filteredProjects, filterMode]);

  const combined = useMemo(() => [...sourceFilteredProjects, ...includedDesktopFolders], [includedDesktopFolders, sourceFilteredProjects]);

  const baseProjects = combined.map((project, index): ProjectDisplay => ({
    branch: index % 2 === 0 ? "main" : "develop",
    id: project.id, name: renamedProjectNames[project.id] ?? project.name, path: project.path,
    sourceProject: project, stack: project.stack,
    status: projectStatuses[index % projectStatuses.length],
    updated: `Updated ${project.updated}`
  }));
  const displayProjects = baseProjects
    .filter((p) => !deletedProjectIds.has(p.id))
    .map((p) => ({ ...p, status: archivedProjectIds.has(p.id) ? "Archived" as const : p.status }));
  const estimatedCardHeight = width <= 375 ? 134 : width <= 393 ? 130 : 122;
  const estimatedProjectsHeight = 182 + 44 + 18 + 18 + 14 * 4 + displayProjects.length * estimatedCardHeight + Math.max(displayProjects.length - 1, 0) * 12;
  const availableProjectsHeight = height - 74 - 88;

  useEffect(() => { props.onScrollNeededChange(estimatedProjectsHeight > availableProjectsHeight); }, [availableProjectsHeight, estimatedProjectsHeight, props.onScrollNeededChange]);

  const selectFilterMode = (mode: typeof projectFilterModes[number]) => { setFilterMode(mode); setFilterMenuOpen(false); };
  const createProject = () => { setFilterMenuOpen(false); setMenuProjectId(null); setRenamingProjectId(null); setDeletedProjectIds(new Set()); void props.onCreateProject(); };
  const openProject = (project: ProjectDisplay) => {
    setOpenedProjectId(project.id); setFilterMenuOpen(false); setMenuProjectId(null); setRenamingProjectId(null);
    props.onOpenProjectPreview(project.sourceProject?.id ?? project.id, project.name);
  };
  const archiveProject = (id: string) => {
    setDeletedProjectIds((c) => { const n = new Set(c); n.delete(id); return n; });
    setArchivedProjectIds((c) => new Set(c).add(id));
    setMenuProjectId(null);
    if (renamingProjectId === id) setRenamingProjectId(null);
  };
  const deleteProject = (id: string) => {
    setDeletedProjectIds((c) => new Set(c).add(id));
    setArchivedProjectIds((c) => { const n = new Set(c); n.delete(id); return n; });
    if (openedProjectId === id) setOpenedProjectId(null);
    if (menuProjectId === id) setMenuProjectId(null);
    if (renamingProjectId === id) setRenamingProjectId(null);
  };
  const requestDeleteProject = (p: ProjectDisplay) => { setDeleteTarget(p); setFilterMenuOpen(false); setMenuProjectId(null); if (renamingProjectId === p.id) setRenamingProjectId(null); };
  const confirmDeleteProject = () => { if (!deleteTarget) return; deleteProject(deleteTarget.id); setDeleteTarget(null); };
  const cancelDeleteProject = () => setDeleteTarget(null);
  const startRenameProject = (p: ProjectDisplay) => { setRenameDraft(p.name); setFilterMenuOpen(false); setRenamingProjectId(p.id); setMenuProjectId(null); };
  const submitRenameProject = (id: string) => {
    const n = renameDraft.trim();
    if (n.length > 0) setRenamedProjectNames((c) => ({ ...c, [id]: n }));
    setRenamingProjectId(null); setRenameDraft("");
  };
  const cancelRenameProject = () => { setRenamingProjectId(null); setRenameDraft(""); };
  const toggleProjectMenu = (id: string) => setMenuProjectId((c) => c === id ? null : id);
  const toggleFilterMenu = () => setFilterMenuOpen((c) => !c);

  return {
    projectLayout, displayProjects, deleteTarget,
    filterMode, filterMenuOpen, menuProjectId, openedProjectId, renamingProjectId, renameDraft,
    setRenameDraft,
    selectFilterMode, createProject, openProject, archiveProject, requestDeleteProject,
    confirmDeleteProject, cancelDeleteProject, startRenameProject, submitRenameProject,
    cancelRenameProject, toggleProjectMenu, toggleFilterMenu
  };
}
