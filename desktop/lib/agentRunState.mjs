import { maxConcurrentAgents } from "./membershipEntitlements.mjs";

export const LOCAL_AGENT_RUN_CAP = 12;

const ACTIVE_STATES = new Set(["running", "applying"]);

export function ensureAgentRunStore(state) {
  if (!state.agentRuns || typeof state.agentRuns !== "object" || Array.isArray(state.agentRuns)) {
    state.agentRuns = {};
  }
  return state.agentRuns;
}

export function listAgentRuns(state) {
  return Object.values(ensureAgentRunStore(state))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt || b.startedAt || 0) - Date.parse(a.updatedAt || a.startedAt || 0));
}

export function currentAgentRun(state) {
  const runs = listAgentRuns(state);
  return runs.find((run) => ACTIVE_STATES.has(run.state)) ?? runs.find((run) => run.state === "waiting") ?? null;
}

export function activeAgentRunCount(state) {
  return listAgentRuns(state).filter((run) => ACTIVE_STATES.has(run.state)).length;
}

export function maxConcurrentAgentRuns(account) {
  return Math.min(LOCAL_AGENT_RUN_CAP, maxConcurrentAgents(account));
}

export function assertCanStartAgentRun(state) {
  const limit = maxConcurrentAgentRuns(state.desktopAccount);
  if (activeAgentRunCount(state) >= limit) {
    throw new Error(`Maximum concurrent desktop agents reached (${limit}). Wait for a run to finish before starting another.`);
  }
}

export function putAgentRun(state, run) {
  const store = ensureAgentRunStore(state);
  const now = new Date().toISOString();
  store[run.id] = {
    ...run,
    startedAt: run.startedAt || now,
    updatedAt: run.updatedAt || now
  };
  return store[run.id];
}

export function updateAgentRun(state, runId, patch) {
  const store = ensureAgentRunStore(state);
  if (!runId || !store[runId]) return null;
  store[runId] = {
    ...store[runId],
    ...patch,
    id: runId,
    updatedAt: patch?.updatedAt || new Date().toISOString()
  };
  return store[runId];
}

export function removeAgentRun(state, runId) {
  if (!runId) return;
  delete ensureAgentRunStore(state)[runId];
}
