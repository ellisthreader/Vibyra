import { useProjectStore, type AppView } from './projectStore';
let returnView: AppView = 'home';
export function openNewProject() {
  const { view } = useProjectStore.getState();
  if (view !== 'new-project') returnView = view;
  useProjectStore.setState({ view: 'new-project' });
}
export function closeNewProject() {
  useProjectStore.setState({ view: returnView });
}
