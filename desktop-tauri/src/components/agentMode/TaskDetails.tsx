import { useEffect, useState } from "react";
import type { AgentRun, RunArtifact } from "../../agentRunTypes";
import { getRun, runArtifacts } from "../../ipc/agentRuns";
import { writeClipboardText } from "../../ipc/tools";
import { AnswerBlock } from "./AnswerBlock";

export function TaskDetails({ run: summary }: { run: AgentRun }) {
  const [detail, setDetail] = useState<AgentRun | null>(null);
  const run = detail?.id === summary.id ? detail : summary;
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    setArtifacts([]); setError(""); setCopied(false); setDetail(null);
    void Promise.all([getRun(summary.id), runArtifacts(summary.id)]).then(([record, rows]) => { if (active) { setDetail(record); setArtifacts(rows); } })
      .catch((error) => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, [summary.id, summary.status]);
  const copy = async () => {
    try { await writeClipboardText(JSON.stringify({ run, artifacts }, null, 2)); setCopied(true); }
    catch (error) { setError(String(error)); }
  };
  return (
    <div className="task-detail">
      {run.message && <p className="task-detail__message" role="status">{run.message}</p>}
      {run.status === "succeeded" && <p className="task-detail__message">Review the saved outputs against your task’s acceptance criteria.</p>}
      <dl className="task-detail__facts">
        <div><dt>Provider</dt><dd>{run.spec.providerVersion}</dd></div>
        <div><dt>Model</dt><dd>{run.spec.model || "Provider default"}{run.spec.effort ? ` · ${run.spec.effort}` : ""}</dd></div>
        <div><dt>Access</dt><dd>{run.spec.permission === "plan" ? "Read only" : "Granted folders"}</dd></div>
        <div><dt>Limits</dt><dd>{Math.round(run.spec.timeoutMs / 60_000)} minutes · {run.spec.maxToolCalls} tool calls</dd></div>
        <div><dt>Started</dt><dd>{new Date(run.startedMs).toLocaleString()}</dd></div>
        <div><dt>Ended</dt><dd>{run.endedMs ? new Date(run.endedMs).toLocaleString() : "In progress"}</dd></div>
      </dl>
      <details><summary>Original task and context</summary>
        <p className="task-detail__prompt">{run.spec.prompt}</p>
        <dl className="task-detail__facts">
          {run.spec.places.map((place) => <div key={place.id}><dt>{place.access === "read" || run.spec.permission === "plan" ? "Read" : "Read and write"}</dt><dd>{place.path}</dd></div>)}
        </dl>
        <pre>{!detail ? "Loading task context…" : run.spec.context || "No teammate context"}</pre>
        <p className="task-detail__fingerprint">Context reference: {run.spec.contextFingerprint || "None"}</p>
      </details>
      <div className="task-detail__outputs">
        <span className="section-label">Saved outputs</span>
        {artifacts.length === 0 && <p className="task-detail__empty">No output was saved for this task.</p>}
        {artifacts.map((artifact) => <details key={artifact.id}>
          <summary>{artifact.title}</summary>
          {artifact.kind === "answer" ? <AnswerBlock text={artifact.content} streaming={false} /> : <pre>{artifact.content}</pre>}
        </details>)}
      </div>
      {error && <p className="composer__error" role="alert">{error}</p>}
      <button className="btn btn--sm" disabled={!detail} onClick={() => void copy()}>{copied ? "Task record copied" : "Copy task record"}</button>
    </div>
  );
}
