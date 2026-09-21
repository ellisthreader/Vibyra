import { FocusDrawer } from './FocusDrawer';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ProjectActionsSheet } from './newProject/ProjectActionsSheet';
import type { Destination, Project, WorkspaceModel } from './types';
import { useReducedMotion } from './useReducedMotion';

/** Native edge-to-edge presentation for the workspace tree (or Agents roster).
 * Disclosures live in FocusDrawer; closeThen preserves iOS sheet handoff.
 */
export function NavigationDrawer({ visible, destination, workspace, project, currentProjectId, onClose, onNavigate, onNew, onSettings,
  onNewTerminal, onNewProject, onEnterProject, chats, content }: {
  content?: (closeThen: (action: () => void) => void) => ReactNode;
  /** The phone's chats as rows: those in a project, or with none named, every one that matches a search. */
  chats?: (query: string, projectId?: string) => ReactNode; visible: boolean; destination: Destination; workspace: WorkspaceModel;
  /** The folder you are in, which turns the rail into that folder's own column. Ideas has no face: it is the home. */
  project?: Project | null;
  /** The project open on the work surface, marked on the home face even from another page. */
  currentProjectId?: string | null;
  onClose: () => void; onNavigate: (destination: Destination) => void; onNew: () => void;
  /** A project row on the home face: the screen enters it, and this rail becomes its face. */
  onEnterProject?: (projectId: string) => void;
  /** The home face's pinned action. A computer builds the project, so without one this opens the way to add one. */
  onNewProject?: () => void;
  /** Back out of the project face: the rail returns to the projects, the screen to Ideas. */
  onLeaveProject?: () => void;
  /** The folder face's pinned action: a named terminal in that folder. */
  onNewTerminal?: (projectId: string) => void;
  /** Opens the Settings sheet. It is drawn in the app's own tree, so it rises as this rail closes. */
  onSettings?: () => void;
  /** Opens Vibyra tokens, from the balance pill beside the avatar. The same sheet, one page in. */
  onBalance?: () => void;
}) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [optionsFor, setOptionsFor] = useState<Project | null>(null);
  const afterDismiss = useRef<(() => void) | null>(null);
  const finishDismiss = () => {
    const action = afterDismiss.current;
    afterDismiss.current = null;
    action?.();
  };
  // iOS cannot present a sibling sheet while this native modal is still closing.
  const closeThen = (action: () => void) => {
    if (afterDismiss.current || !visible) return;
    afterDismiss.current = action;
    onClose();
  };
  const panelWidth = Math.min(width - 52, 344);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    const motion = Animated.timing(progress, { toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 260 : 180, useNativeDriver: Platform.OS !== 'web',
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) });
    motion.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => motion.stop();
  }, [visible, reducedMotion, progress]);
  useEffect(() => { if (visible) { afterDismiss.current = null; setOptionsFor(null); } }, [visible]);
  useEffect(() => {
    // Android/web do not provide the native iOS dismissal acknowledgement.
    if (!mounted && !visible && Platform.OS !== 'ios') finishDismiss();
  }, [mounted, visible]);
  const navigate = (to: Destination) => { onNavigate(to); onClose(); };
  const hidden = !visible;
  const connected = workspace.status === 'connected';
  const host = workspace.demo ? 'Sample workspace' : workspace.host?.name ?? 'your computer';
  // Renaming or removing a folder here needs the computer, and a Desktop needs its typing switch on.
  const manageReason = workspace.actions.renameProject === undefined || workspace.actions.forgetProject === undefined
    ? `Update Vibyra on ${host} to rename or remove projects from your phone.`
    : !connected ? `${host} is away. Reconnect to rename or remove projects.`
      : workspace.viewOnly !== true || workspace.canManage === true ? null
        : `Turn on typing from your phone in Vibyra on ${host} to rename or remove projects.`;
  return <Modal visible={mounted} transparent presentationStyle="overFullScreen" animationType="none"
    statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    onDismiss={() => { if (!visible) finishDismiss(); }}>
    {mounted && <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />}
    <View style={s.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]} />
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} />
      <Animated.View testID="navigation-drawer" accessibilityViewIsModal aria-hidden={hidden} accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} pointerEvents={hidden ? 'none' : 'auto'}
        style={[s.panel, { width: panelWidth, backgroundColor: colors.rail, borderRightColor: colors.border,
          paddingLeft: insets.left, paddingTop: insets.top,
          shadowOpacity: dark ? 0.4 : 0.12,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth - 30, 0] }) }] }]}>
        {content ? content(closeThen) : <FocusDrawer workspace={workspace} project={project} currentProjectId={currentProjectId} bottom={Math.max(insets.bottom, 14)}
          onClose={onClose} onEnter={id => onEnterProject?.(id)} onOptions={setOptionsFor} onNavigate={navigate}
          onNew={onNew} onTerminal={id => onNewTerminal?.(id)} onProject={() => onNewProject?.()} onSettings={() => onSettings?.()}
          chats={chats} closeThen={closeThen} />}
      </Animated.View>
      <ProjectActionsSheet project={optionsFor} host={host} reason={manageReason} onClose={() => setOptionsFor(null)}
        onRename={name => workspace.actions.renameProject!(optionsFor!.id, name)}
        onForget={() => workspace.actions.forgetProject!(optionsFor!.id)} />
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1 },
  // The rail paints to both screen edges; only its content receives safe-area padding.
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowRadius: 22, shadowOffset: { width: 8, height: 0 }, elevation: 20 },
  body: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  // The actions float over this list, so the last row still scrolls clear of them.
  listContent: { paddingBottom: 92 },
});
