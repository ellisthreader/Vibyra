import { ShotScene, VoiceScene } from "./EcosystemCaptureScenes.jsx";
import { LanesScene, PreviewScene } from "./EcosystemWorkflowScenes.jsx";
import { NotesScene, KeysScene } from "./EcosystemTrustScenes.jsx";

export { ShotScene, VoiceScene, LanesScene, PreviewScene, NotesScene, KeysScene };

export const SCENES = {
    shot: ShotScene,
    voice: VoiceScene,
    lanes: LanesScene,
    preview: PreviewScene,
    notes: NotesScene,
    keys: KeysScene,
};
export const CYCLES = { shot: 8.5, voice: 9, lanes: 8, preview: 8, notes: 8.5, keys: 7.5 };
