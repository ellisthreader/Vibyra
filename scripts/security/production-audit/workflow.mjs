import { fail, pass } from "./findings.mjs";

const actionRefPattern = /^[0-9a-f]{40}$/i;

function workflowJobsWithoutTimeout(text) {
  const missing = [];
  const lines = text.split(/\r?\n/);
  let inJobs = false;
  let currentJob = null;
  let currentHasTimeout = false;

  const finishJob = () => {
    if (currentJob && !currentHasTimeout) missing.push(currentJob);
  };

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (inJobs && /^[^\s#][^:]*:\s*$/.test(line)) {
      finishJob();
      currentJob = null;
      inJobs = false;
      continue;
    }
    const jobMatch = inJobs ? line.match(/^  ([A-Za-z0-9_-]+):\s*$/) : null;
    if (jobMatch) {
      finishJob();
      currentJob = jobMatch[1];
      currentHasTimeout = false;
      continue;
    }
    if (currentJob && /^    timeout-minutes:\s*\d+\s*$/.test(line)) {
      currentHasTimeout = true;
    }
  }
  finishJob();
  return missing;
}

export function auditWorkflowText(relativePath, text) {
  const results = [];
  const actionRefs = [...text.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)];
  const unpinned = actionRefs
    .filter((match) => !match[1].startsWith("./") && !actionRefPattern.test(match[2]))
    .map((match) => `${match[1]}@${match[2]}`);

  results.push(
    unpinned.length === 0
      ? pass(`workflow.${relativePath}.actions`, "All external actions use full commit SHAs.")
      : fail(
          `workflow.${relativePath}.actions`,
          `Unpinned external actions: ${unpinned.join(", ")}.`
        )
  );

  const missingTimeouts = workflowJobsWithoutTimeout(text);
  results.push(
    missingTimeouts.length === 0
      ? pass(`workflow.${relativePath}.timeouts`, "Every job has a timeout.")
      : fail(
          `workflow.${relativePath}.timeouts`,
          `Jobs missing timeout-minutes: ${missingTimeouts.join(", ")}.`
        )
  );

  const hasReadOnlyBaseline =
    /^permissions:\s*\n(?: {2}[A-Za-z-]+:\s*(?:read|write)\s*\n)* {2}contents:\s*read\s*$/m.test(
      text
    );
  results.push(
    hasReadOnlyBaseline
      ? pass(`workflow.${relativePath}.permissions`, "Workflow declares contents: read.")
      : fail(
          `workflow.${relativePath}.permissions`,
          "Workflow must declare a top-level contents: read permission baseline."
        )
  );

  results.push(
    text.includes("pull_request_target:")
      ? fail(
          `workflow.${relativePath}.trigger`,
          "pull_request_target is prohibited for workflows that execute repository code."
        )
      : pass(`workflow.${relativePath}.trigger`, "No pull_request_target trigger is present.")
  );

  return results;
}
