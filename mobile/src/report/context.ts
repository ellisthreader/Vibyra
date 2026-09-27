import Constants from 'expo-constants';
import { Dimensions, PixelRatio, Platform } from 'react-native';
import { appVersion } from '../settings/links';
import type { WorkspaceModel } from '../ui/types';
import type { ReportContext } from './api';

export function reportContext(workspace: WorkspaceModel): ReportContext {
  const session = workspace.sessions.find((item) => item.id === workspace.selectedSessionId);
  const project = workspace.projects.find((item) => item.id === session?.projectId);
  const screen = Dimensions.get('screen');
  const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
  return {
    appVersion: appVersion() || 'unknown',
    platform: `${os} ${String(Platform.Version)}`,
    hardware:
      Platform.OS === 'ios'
        ? Constants.platform?.ios?.model || 'iPhone'
        : Platform.OS === 'android'
          ? Platform.constants.Model || 'Android phone'
          : 'Browser',
    screen: `${Math.round(screen.width)}×${Math.round(screen.height)} @ ${PixelRatio.get()}x`,
    project: project?.name ?? null,
    projectRoot: project?.path ?? null,
    agent: session?.kind ?? null,
    pane: session?.title ?? null,
  };
}
