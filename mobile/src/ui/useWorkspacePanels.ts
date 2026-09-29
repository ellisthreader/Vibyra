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
  const [newProject, setNewProject] = useState(false);
  const [sessionOptions, setSessionOptions] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  useEffect(() => {
    setConnect(false);
  }, [demo, onboardingStatus]);
  useEffect(() => {
    setSessionOptions(false);
  }, [selectedSessionId]);
  useEffect(() => {
    setLivePreview(false);
  }, [selectedSessionId, projectId]);
  const openLivePreview = () => {
    Keyboard.dismiss();
    setLivePreview(true);
  };
  return {
    connect,
    setConnect,
    newProject,
    setNewProject,
    sessionOptions,
    setSessionOptions,
    livePreview,
    setLivePreview,
    openLivePreview,
  };
}
