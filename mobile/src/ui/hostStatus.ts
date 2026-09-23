import type { WorkspaceModel } from './types';

/** What the drawn computer's screen shows: running code, the logo over a
 *  spinner while it is being reached, or a dim logo while it is out of reach. */
export type Figure = 'live' | 'waking' | 'asleep';
export interface ConnectionWords {
  label: string;
  tone: 'success' | 'accent' | 'muted' | 'error';
  working: boolean;
  figure: Figure;
  /** What stopped the connection, when something did and nothing is being tried. */
  problem: string | null;
}

/** One line for the state of the connection, from what the store actually
 *  reports. Being on the way back (`reconnecting`, or an attempt in flight) is
 *  said as such, never as "Not connected" next to an error the app is already
 *  acting on; the error is shown only once the app has stopped trying. */
export function describeConnection(
  workspace: Pick<WorkspaceModel, 'status' | 'reconnecting' | 'error' | 'demo'>,
): ConnectionWords {
  if (workspace.demo)
    return {
      label: 'Sample computer',
      tone: 'muted',
      working: false,
      figure: 'live',
      problem: null,
    };
  if (workspace.status === 'connected')
    return { label: 'Connected', tone: 'success', working: false, figure: 'live', problem: null };
  if (workspace.status === 'pairing') {
    return {
      label: 'Waiting for approval on your computer',
      tone: 'accent',
      working: true,
      figure: 'waking',
      problem: null,
    };
  }
  if (workspace.status === 'connecting' || workspace.reconnecting) {
    return {
      label: 'Reconnecting…',
      tone: 'accent',
      working: true,
      figure: 'waking',
      problem: null,
    };
  }
  if (workspace.status === 'error' && workspace.error) {
    return {
      label: 'Couldn’t reach your computer',
      tone: 'error',
      working: false,
      figure: 'asleep',
      problem: workspace.error,
    };
  }
  return { label: 'Not connected', tone: 'muted', working: false, figure: 'asleep', problem: null };
}
