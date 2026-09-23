import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Short-lived panels and their navigation resets for the workspace shell. */
export function useWorkspacePanels(
  demo: boolean | undefined,
  onboardingStatus: string,
  selectedSessionId: string | null,
  projectId: string | null,
) {
  const [connect, setConnect] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [sessionOptions, setSessionOptions] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string>();
  useEffect(() => {
    setConnect(false);
    setNewSession(false);
  }, [demo, onboardingStatus]);
  useEffect(() => {
    setSessionOptions(false);
  }, [selectedSessionId]);
  useEffect(() => {
    setLivePreview(false);
  }, [selectedSessionId, projectId]);
  const start = (id: string | undefined, connected: boolean) => {
    setInitialProjectId(id);
    if (connected) setNewSession(true);
    else setConnect(true);
  };
  const openLivePreview = () => {
    Keyboard.dismiss();
    setLivePreview(true);
  };
  return {
    connect,
    setConnect,
    newSession,
    setNewSession,
    newProject,
    setNewProject,
    sessionOptions,
    setSessionOptions,
    livePreview,
    setLivePreview,
    initialProjectId,
    start,
    openLivePreview,
  };
}
