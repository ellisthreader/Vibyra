import { useProjectCreateStore } from './projectCreateStore';
import { useProjectStore, type AppView } from './projectStore';

let returnView: AppView = 'home';

export function openNewProject() {
  const { view } = useProjectStore.getState();
  if (view !== 'new-project') returnView = view;
  // Starting over is the store's own call: a build that outlives the page it
  // was started from is shown as it stands rather than thrown away.
  useProjectCreateStore.getState().start();
  useProjectStore.setState({ view: 'new-project' });
}

export function closeNewProject() {
  useProjectStore.setState({ view: returnView });
}
