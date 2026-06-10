import { useCallback, useState } from "react";
import { generatePublishAsset } from "../../../utils/communityApi";
import type { useProjectPublishStatuses } from "../hooks/useProjectPublishStatuses";
import type { ProjectDisplay } from "../types";
import { removeProjectListing, saveProjectListing } from "./ProjectPublishListingMutations";
import type { ProjectListingPayload } from "./ProjectPublishModal.data";
import { hasProjectListing } from "./ProjectPublishLifecycle";
import { publishProjectRelease } from "./ProjectPublishRelease";
import { publishResultFromOutcome, type PublishFlowResult, type PublishProgressStage } from "./ProjectPublishResult";

type AppContextValue = ReturnType<typeof import("../../../context/AppContext").useAppContext>;
type PublishStatuses = ReturnType<typeof useProjectPublishStatuses>;

export function useProjectPublishFlow(app: AppContextValue, statuses: PublishStatuses) {
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<"logo" | "screenshot" | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PublishProgressStage | null>(null);
  const [result, setResult] = useState<PublishFlowResult>(null);
  const [target, setTarget] = useState<ProjectDisplay | null>(null);
  const status = target ? statuses.items[target.sourceProject?.id ?? target.id] : null;

  const open = useCallback((project: ProjectDisplay) => {
    setError(""); setResult(null); setTarget(project);
  }, []);
  const close = useCallback(() => {
    if (busy) return;
    setError(""); setProgress(null); setResult(null); setTarget(null);
  }, [busy]);
  const complete = useCallback(() => {
    setError(""); setProgress(null); setResult(null); setTarget(null);
  }, []);

  async function publish(payload: ProjectListingPayload) {
    if (!target || !app.authToken) {
      setResult(null); setError("Log in before publishing a project."); return;
    }
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await publishProjectRelease({ app, onProgress: setProgress, payload, project: target });
      statuses.upsert(response.publishStatus);
      setResult(publishResultFromOutcome(response.outcome, response, hasProjectListing(status) ? "update" : "first"));
      void statuses.refresh();
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Project could not be published.");
      await statuses.refresh();
    } finally {
      setBusy(false); setProgress(null);
    }
  }

  async function save(payload: ProjectListingPayload) {
    if (!app.authToken || !target || !status) {
      setError("This listing could not be updated. Refresh Projects and try again."); return;
    }
    setBusy(true); setError(""); setResult(null);
    try {
      const saved = await saveProjectListing(app.authToken, status, payload);
      statuses.upsert(saved.publishStatus); setResult(saved.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!app.authToken || !status) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const deleted = await removeProjectListing(app.authToken, status);
      statuses.remove(deleted.sourceProjectId); setResult(deleted.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The listing could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function generate(kind: "logo" | "screenshot", payload: { description: string; prompt: string; title: string }) {
    if (!app.authToken) {
      setResult(null); setError("Log in before generating publish images."); return null;
    }
    setGenerating(kind); setError(""); setResult(null);
    try {
      const response = await generatePublishAsset({ authToken: app.authToken, kind, ...payload });
      if (response.user) app.applyRemoteUserFromIap(response.user);
      return response.imageUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${kind} could not be generated.`);
      return null;
    } finally {
      setGenerating(null);
    }
  }

  return { busy, close, complete, error, generate, generating, open, progress, publish, remove, result, save, setResult, status, target };
}
