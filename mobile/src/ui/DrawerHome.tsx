import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useVibesChats } from '../vibes/VibesProvider';
import { sessionsInProject, terminalWords } from './DrawerProjects';
import { chatsInProject, chatWords, IDEAS_PROJECT_ID, knownProjects } from './ideas';
import { Icon, type IconName } from './primitives';
import { RailGroup, RailNote, RailRow, RailSection } from './RailRow';
import type { Destination, Project, WorkspaceModel } from './types';

/**
 * The rail's home face is the list of projects, and that list is the app.
 *
 * Ideas leads: the project on the phone, always there, its spark the one accent
 * in the column. Under it, the computer's folders under the computer's own
 * name, each with its branch and how much is open in it, the live dot saying
 * which are working. Then the two places that are not projects; the rail draws
 * Ideas' chats after these. A folder row enters it — the rail becomes that
 * folder's face — and holding one opens what can be done to it here.
 */
export function DrawerHome({ workspace, query, destination, currentProjectId, onEnter, onOptions, onNavigate }: {
  workspace: WorkspaceModel; query: string; destination: Destination; currentProjectId?: string | null;
  onEnter: (projectId: string) => void; onOptions: (project: Project) => void; onNavigate: (to: Destination) => void;
}) {
  const { chats } = useVibesChats();
  const away = workspace.status !== 'connected';
  const host = workspace.demo ? 'Sample workspace' : workspace.host?.name ?? 'your computer';
  const ideas = chatWords(chatsInProject(chats, IDEAS_PROJECT_ID, workspace).length);
  const folders = knownProjects(workspace).filter(project => !query || project.name.toLowerCase().includes(query));
  const showIdeas = !query || 'ideas'.includes(query);
  const inProject = destination === 'work';
  const places: { id: Destination; label: string; icon: IconName }[] = [
    { id: 'computers', label: 'Remote', icon: 'desktop-outline' },
    { id: 'integrations', label: 'Integrations', icon: 'link-outline' },
  ];
  return <>
    {query !== '' && !showIdeas && folders.length === 0 && <RailNote>{`No projects match “${query}”.`}</RailNote>}
    {showIdeas && <View style={s.lead}><RailGroup>
      <RailRow mark={<Tile icon="sparkles" accent />} label="Ideas" detail={ideas} accessibilityLabel={`Ideas, ${ideas}`}
        selected={inProject && currentProjectId === IDEAS_PROJECT_ID} onPress={() => onEnter(IDEAS_PROJECT_ID)} />
    </RailGroup></View>}
    {workspace.host && (folders.length > 0 || !query) && <>
      <RailSection>{away ? `${host} is away` : host}</RailSection>
      <RailGroup>
        {folders.map(project => {
          const sessions = away ? [] : sessionsInProject(workspace.sessions, project.id);
          const running = sessions.some(session => session.status === 'running');
          const where = project.branch ?? project.path.split('/').filter(Boolean).pop() ?? project.path;
          return <RailRow key={project.id} mark={<Tile icon={project.kind === 'vault' ? 'book-outline' : 'folder-outline'} faded={away} />}
            label={project.name} faded={away} state={running ? 'running' : null}
            detail={sessions.length ? `${where} · ${sessions.length} ${sessions.length === 1 ? 'terminal' : 'terminals'}` : where}
            selected={inProject && !away && currentProjectId === project.id}
            accessibilityLabel={`${project.name}, ${terminalWords(sessions)}`}
            accessibilityHint={away ? 'Shows what is known about this project' : 'Opens this project'}
            onPress={() => away ? onOptions(project) : onEnter(project.id)} onLongPress={() => onOptions(project)} />;
        })}
        {folders.length === 0 && <RailNote>{workspace.viewOnly
          ? `Open a project in Vibyra on ${host} to see it here.` : `Add a folder in Vibyra Host on ${host} to see it here.`}</RailNote>}
      </RailGroup>
    </>}
    {!query && <View style={s.places}><RailGroup>
      {places.map(place => <RailRow key={place.id} icon={place.icon} label={place.label}
        selected={destination === place.id} onPress={() => onNavigate(place.id)} />)}
    </RailGroup></View>}
  </>;
}

/** A project's mark: a soft tile with one glyph, the way an agent has its brand tile. */
export function Tile({ icon, accent = false, faded = false, size = 34 }: { icon: IconName; accent?: boolean; faded?: boolean; size?: number }) {
  const { colors } = useTheme();
  return <View style={[s.tile, { width: size, height: size, borderRadius: Math.round(size / 3),
    backgroundColor: accent ? colors.accentSoft : colors.elevated, opacity: faded ? 0.6 : 1 }]}>
    <Icon name={icon} size={Math.round(size * 0.53)} color={accent ? colors.accent : colors.text} />
  </View>;
}
const s = StyleSheet.create({
  lead: { paddingTop: 6 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  places: { paddingTop: 22 },
});
