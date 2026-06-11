import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { discoverProjects, terminalProjectById } from "./projects.mjs";
import { readBody, send } from "./http.mjs";
import { aiTerminalAgentStatus, listAiTerminalAgentStatuses } from "./aiTerminalProcess.mjs";
import {
  connectPersistentAiTerminalProcess,
  launchPersistentAiTerminalProcess,
  listPersistentAiTerminalSessions,
  persistentAiTerminalConfigIsCurrent,
  removePersistentAiTerminalSession,
  waitForPersistentAiTerminalStartup,
  updatePersistentAiTerminalSession
} from "./aiTerminalPersistentProcess.mjs";
import {
  normalizeTerminalWorkspaceMode,
  inspectTerminalWorkspace,
  createTerminalWorkspaceCheckpoint,
  prepareTerminalWorkspace,
  restoredTerminalWorkspace,
  rollbackPreparedTerminalWorkspace
} from "./terminalWorktrees.mjs";
import { terminalMemoryInstructions } from "./desktopTerminalMemory.mjs";
import { routeDesktopAutoModel } from "./desktopChat.mjs";
import { resolveAiTerminalLaunchPlan } from "./aiTerminalLaunchPlan.mjs";
import { terminalProviderAdapters } from "./aiTerminalProviderAdapters.mjs";
import { terminalRuntimeExecutable } from "./aiTerminalRuntimes.mjs";
import {
  AUTO_DECIDING_FRAME_INTERVAL_MS,
  AUTO_DECIDING_MINIMUM_MS,
  autoTerminalDecidingStart,
  autoTerminalDecidingHandoff,
  autoTerminalDecidingStop,
  autoTerminalDecidingUpdate,
  autoTerminalPrompt,
  autoTerminalWaitingOutput,
  consumeAutoTerminalInput
} from "./aiTerminalAutoWaiting.mjs";
import { providerAccountsState } from "./providerAccounts.mjs";
import { appState } from "./state.mjs";
import {
  issueTerminalGatewayToken,
  revokeTerminalGatewayTokensForTerminal
} from "./terminalGatewayAuth.mjs";
import {
  compileTerminalTeamAssignment,
  normalizeTerminalTeamLaunch
} from "./terminalTeamPromptRoles.mjs";
import { terminalTeamAssignmentForPlan } from "./terminalTeamPlanner.mjs";

export const MAX_PTY_TERMINAL_SESSIONS = 12;

const MAX_OUTPUT_BUFFER = 50_000;
const MAX_ASSIGNMENT_PROMPT = 8_000;
const ASSIGNMENT_TIMEOUT_MS = 5_000;
const STARTUP_ASSIGNMENT_TIMEOUT_MS = 30_000;
const agents = new Set(["shell", "vibyra", "codex", "claude", "gemini"]);
const sessions = new Map();
const subscribers = new Map();

await restorePersistentSessions();

export async function handlePtyTerminalRoutes(req, res, url) {
  const route = ptyRoute(url.pathname);
  if (!route) return false;
  if (req.method === "GET" && route.action === "collection") {
    send(res, 200, { sessions: listPtyTerminals(), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  if (req.method === "POST" && route.action === "collection") {
    const body = await readBody(req);
    const session = await createPtyTerminal(body);
    const prompt = sanitizeAssignmentPrompt(body.initialPrompt);
    const assignment = prompt
      ? await assignPtyTerminalTask(session.id, {
        assignmentId: string(body.assignmentId) || `assignment-${session.id}-${Date.now()}`,
        prompt
      }, {
        timeoutMs: STARTUP_ASSIGNMENT_TIMEOUT_MS
      })
      : null;
    if (assignment && assignment.state !== "written-to-child") {
      closePtyTerminal(session.id);
      throw httpError(
        assignment.state === "timed-out" ? 504 : 409,
        assignment.reason || "The terminal task could not be delivered."
      );
    }
    send(res, 200, {
      session: sessions.has(session.id) ? publicSession(sessions.get(session.id)) : session,
      ...(assignment ? { assignment } : {}),
      agents: listAiTerminalAgentStatuses()
    });
    return true;
  }
  if (req.method === "POST" && route.action === "workspace-preflight") {
    send(res, 200, await terminalWorkspacePreflight(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && route.action === "workspace-checkpoint") {
    send(res, 200, await terminalWorkspaceCheckpoint(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && route.action === "close-all") {
    const closed = closeAllPtyTerminals();
    send(res, 200, { ok: true, closed, sessions: listPtyTerminals(), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  if (req.method === "POST" && route.action === "input") {
    await writePtyInput(route.id, String((await readBody(req))?.input ?? ""));
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && route.action === "assign") {
    const assignment = await assignPtyTerminalTask(route.id, await readBody(req));
    const status = assignment.state === "written-to-child"
      ? 200
      : assignment.state === "timed-out" ? 504 : 409;
    send(res, status, {
      ok: status === 200,
      assignment,
      ...(status === 200 ? {} : { error: assignment.reason || "The terminal assignment was rejected." })
    });
    return true;
  }
  if (req.method === "POST" && route.action === "resize") {
    resizePtyTerminal(route.id, await readBody(req));
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && route.action === "model") {
    send(res, 200, { ok: true, session: switchPtyTerminalModel(route.id, await readBody(req)) });
    return true;
  }
  if (req.method === "PATCH" && route.action === "session") {
    send(res, 200, { ok: true, session: renamePtyTerminal(route.id, await readBody(req)) });
    return true;
  }
  if (req.method === "POST" && route.action === "close") {
    const closed = closePtyTerminal(route.id);
    send(res, 200, { ok: true, closed, sessions: listPtyTerminals(), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  return false;
}

async function terminalWorkspacePreflight(body = {}) {
  await discoverProjects();
  const project = terminalProjectById(string(body.projectId));
  if (!project) throw httpError(404, "The selected terminal project is no longer available.");
  try {
    const state = await inspectTerminalWorkspace(project);
    return { ok: true, project: { id: project.id, name: project.name }, ...state };
  } catch (error) {
    throw httpError(409, error instanceof Error ? error.message : "The project could not be checked.");
  }
}

async function terminalWorkspaceCheckpoint(body = {}) {
  await discoverProjects();
  const project = terminalProjectById(string(body.projectId));
  if (!project) throw httpError(404, "The selected terminal project is no longer available.");
  try {
    const state = await createTerminalWorkspaceCheckpoint(project);
    return { ok: true, project: { id: project.id, name: project.name }, ...state };
  } catch (error) {
    throw httpError(409, error instanceof Error ? error.message : "The local checkpoint could not be created.");
  }
}

export function handlePtyTerminalUpgrade(req, socket) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const route = ptyRoute(url.pathname);
  if (!route || route.action !== "socket" || !isLoopback(req)) {
    socket.destroy();
    return;
  }
  const session = sessions.get(route.id);
  if (!session) {
    socket.destroy();
    return;
  }
  acceptWebSocket(req, socket);
  const unsubscribe = subscribePtyTerminal(session.id, (payload) => sendFrame(socket, JSON.stringify(payload)));
  let pendingSocketData = Buffer.alloc(0);
  let pendingSocketFragments = [];
  socket.on("data", (chunk) => {
    try {
      const parsed = readFrames(Buffer.concat([pendingSocketData, chunk]), pendingSocketFragments);
      pendingSocketData = parsed.remaining;
      pendingSocketFragments = parsed.fragments;
      for (const message of parsed.messages) handlePtySocketMessage(session.id, message);
    } catch (error) {
      console.error(error instanceof Error ? error.stack || error.message : error);
      socket.destroy();
    }
  });
  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
}

export async function createPtyTerminal(body = {}) {
  const requestedId = string(body.id);
  const projectId = string(body.projectId);
  const requestedModel = string(body.model).slice(0, 140);
  let model = requestedModel;
  const tokenMode = normalizeTokenMode(body.tokenMode);
  const requestedInitialPrompt = sanitizeAssignmentPrompt(body.initialPrompt);
  const waitingAuto = requestedModel.toLowerCase() === "auto" && !requestedInitialPrompt;
  let autoRouting = null;
  if (requestedModel.toLowerCase() === "auto") {
    if (tokenMode !== "vibyra") {
      throw httpError(409, "Auto terminal routing is only available with Vibyra tokens.");
    }
    if (!waitingAuto) {
      const allowedProviders = managedTerminalProviders();
      if (!allowedProviders.length) {
        throw httpError(409, "No native Vibyra terminal runtime is currently ready for Auto.");
      }
      const routed = await routeDesktopAutoModel({
        prompt: requestedInitialPrompt,
        allowedProviders
      });
      model = string(routed.modelKey).slice(0, 140);
      autoRouting = routed.autoRouting || null;
    }
  }
  const agent = terminalAgentForTokenSource(model, tokenMode, providerAccountsState(), body.agent);
  const reasoningEffort = normalizeReasoningEffort(body.reasoningEffort || body.effort);
  let permissionMode = normalizePermissionMode(body.permissionMode, agent);
  let launchPlan = waitingAuto || agent === "shell" || !model ? null : resolveAiTerminalLaunchPlan({
    model: requestedModel || model,
    billingMode: tokenMode,
    permissionMode,
    initialTask: requestedInitialPrompt,
    routedModel: model
  });
  const plannedAssignment = body.teamPlanId
    ? terminalTeamAssignmentForPlan(body.teamPlanId, body.teamRoleKey, body.teamId)
    : null;
  if (body.teamPlanId && !plannedAssignment) {
    throw httpError(409, "That Team plan is missing, stale, or does not match this role.");
  }
  const teamBody = plannedAssignment ? {
    ...body,
    teamId: plannedAssignment.teamId,
    teamSize: plannedAssignment.teamSize,
    teamGoal: plannedAssignment.goal,
    teamPlanId: plannedAssignment.planId,
    teamPlannerMode: plannedAssignment.plannerMode,
    teamPlannerModel: plannedAssignment.plannerModel,
    teamPlannerFallbackReason: plannedAssignment.fallbackReason || "",
    teamAssignment: plannedAssignment.assignment
  } : body;
  const team = launchPlan
    ? normalizeTerminalTeamLaunch(teamBody, launchPlan.runtimeId)
    : normalizeTerminalTeamLaunch(teamBody, "");
  if (team) {
    permissionMode = team.permissionMode;
    launchPlan = resolveAiTerminalLaunchPlan({
      model: requestedModel || model,
      billingMode: tokenMode,
      permissionMode,
      sandboxMode: team.sandboxMode,
      initialTask: requestedInitialPrompt,
      routedModel: model
    });
  }
  const initialPrompt = team
    ? sanitizeAssignmentPrompt(compileTerminalTeamAssignment(team))
    : requestedInitialPrompt;
  if (tokenMode === "vibyra" && launchPlan && !appState.desktopAccountToken) {
    throw httpError(401, "Log in to Vibyra Desktop before opening a Vibyra-credit terminal.");
  }
  const workspaceMode = projectId ? normalizeTerminalWorkspaceMode(body.workspaceMode) : "shared";
  const existing = requestedId ? sessions.get(requestedId) : null;
  if (existing && existing.status !== "exited") {
    if (projectId !== existing.projectId) {
      throw httpError(409, "That terminal ID is already running in a different project.");
    }
    if (
      model !== existing.model
      || agent !== existing.agent
      || reasoningEffort !== existing.reasoningEffort
      || permissionMode !== existing.permissionMode
      || tokenMode !== existing.tokenMode
      || workspaceMode !== existing.workspaceMode
      || JSON.stringify(launchPlan) !== JSON.stringify(existing.launchPlan)
      || JSON.stringify(publicTeam(team)) !== JSON.stringify(publicTeam(existing.team))
    ) {
      throw httpError(409, "That terminal ID is already running with different launch settings.");
    }
    resizePtyTerminal(existing.id, body);
    return publicSession(existing);
  }
  if (existing) closePtyTerminal(existing.id);
  assertTeamRoleAvailable(team, { terminalId: requestedId, projectId, model, tokenMode });
  if (sessions.size >= MAX_PTY_TERMINAL_SESSIONS) throw httpError(429, "Vibyra Desktop supports up to " + MAX_PTY_TERMINAL_SESSIONS + " terminals at once.");
  const project = terminalProjectById(projectId);
  if (projectId && !project) throw httpError(404, "The selected terminal project is no longer available.");
  const memoryInstructions = waitingAuto || team ? "" : await officialTerminalMemory(agent, projectId);
  const agentStatus = waitingAuto
    ? autoWaitingAgentStatus()
    : aiTerminalAgentStatus(agent, model, launchPlan?.runtimeId);
  let workspace = {
    workspaceMode: "shared",
    cwd: project?.path || process.cwd(),
    branchName: "",
    workspacePath: "",
    repositoryRoot: "",
    workspaceNotice: ""
  };
  if (workspaceMode === "worktree") {
    try {
      workspace = await prepareTerminalWorkspace({ project, terminalId: requestedId, workspaceMode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The isolated terminal workspace could not be created.";
      if (!body.allowSharedFallback) throw httpError(409, message);
      workspace.workspaceNotice = `Separate branches could not start, so this terminal opened in the shared folder. ${message}`;
    }
  }
  const session = {
    id: requestedId || "pty-" + Date.now() + "-" + randomUUID().slice(0, 8),
    title: autoRouting
      ? routedTerminalTitle(model, body.title)
      : string(body.title).slice(0, 72) || "Terminal",
    agent,
    agentStatus,
    requestedModel: requestedModel || model,
    model,
    autoRouting,
    reasoningEffort,
    permissionMode,
    sandboxMode: launchPlan?.sandboxMode || "workspace-write",
    tokenMode,
    launchPlan,
    team,
    projectId,
    ...workspace,
    cols: clamp(body.cols, 100),
    rows: clamp(body.rows, 30),
    output: waitingAuto ? autoTerminalWaitingOutput({ cwd: workspace.cwd, cols: body.cols }) : "",
    status: waitingAuto ? "running" : agentStatus.available ? "starting" : "unavailable",
    providerState: waitingAuto ? "ready" : !agentStatus.available ? "exited" : agent === "shell" ? "fallback-shell" : "starting",
    exitCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    autoAwaitingTask: waitingAuto,
    autoDeciding: false,
    autoInputBuffer: "",
    autoPasteMode: false,
    autoTitle: waitingAuto ? string(body.title).slice(0, 72) || "Auto" : "",
    autoRoutingPromise: null,
    process: null
  };
  const terminalGatewayToken = tokenMode === "vibyra" && launchPlan
    ? issueTerminalGatewayToken(session.id, {
      models: [...launchPlan.allowedModels, launchPlan.nativeModel],
      runtimeId: launchPlan.runtimeId,
      providerId: launchPlan.providerId,
      adapterId: launchPlan.adapterId,
      protocol: launchPlan.protocol,
      nativeModel: launchPlan.nativeModel,
      billingModel: launchPlan.billingModel
    }).token
    : "";
  sessions.set(session.id, session);
  if (waitingAuto) return publicSession(session);
  if (!agentStatus.available) {
    appendOutput(session, `${agentStatus.label || label(session.agent)} is not available.\r\n${agentStatus.installHint}\r\n`);
    return publicSession(session);
  }
  try {
    session.process = launchPersistentAiTerminalProcess({
      agent: session.agent,
      requestedModel: session.requestedModel,
      model: session.model,
      autoRouting: session.autoRouting,
      reasoningEffort: session.reasoningEffort,
      permissionMode: session.permissionMode,
      sandboxMode: session.sandboxMode,
      tokenMode: session.tokenMode,
      projectId: session.projectId,
      workspaceMode: session.workspaceMode,
      branchName: session.branchName,
      workspacePath: session.workspacePath,
      repositoryRoot: session.repositoryRoot,
      workspaceNotice: session.workspaceNotice,
      memoryInstructions,
      roleInstructions: team?.roleInstructions || "",
      team,
      terminalGatewayToken,
      launchPlan,
      terminalId: session.id,
      title: session.title,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt
    }, persistentHandlers(session));
    await waitForPersistentAiTerminalStartup(session.id);
  } catch (error) {
    session.process?.kill("SIGTERM");
    removePersistentAiTerminalSession(session.id);
    sessions.delete(session.id);
    if (terminalGatewayToken) revokeTerminalGatewayTokensForTerminal(session.id);
    await rollbackPreparedTerminalWorkspace(session);
    throw error;
  }
  return publicSession(session);
}

async function officialTerminalMemory(agent, projectId) {
  if (!["vibyra", "codex", "claude", "gemini"].includes(agent) || !projectId || projectId === "full-pc") return "";
  try {
    return await terminalMemoryInstructions(projectId);
  } catch {
    return "";
  }
}

function persistentHandlers(session, options = {}) {
  return {
    onSnapshot: (payload) => {
      let changed = false;
      const output = String(payload.output || "").slice(-MAX_OUTPUT_BUFFER);
      if (!session.autoDeciding && output && output !== session.output) {
        session.output = output;
        changed = true;
      }
      const workerStatus = String(payload.state?.status || "");
      if (workerStatus && workerStatus !== session.status) {
        session.status = workerStatus;
        changed = true;
      }
      const providerState = normalizeProviderState(payload.state?.providerState);
      if (providerState && providerState !== session.providerState) {
        session.providerState = providerState;
        changed = true;
      }
      session.exitCode = payload.state?.exitCode ?? session.exitCode;
      session.updatedAt = payload.state?.updatedAt || session.updatedAt;
      if (changed) publish(session.id, { type: "session", session: publicSession(session), output });
    },
    onData: (data, meta = {}) => {
      if (options.onData?.(data, meta) === true) return;
      publishPersistentOutput(session, data, meta);
    },
    onExit: ({ code, signal }) => {
      session.process = null;
      session.status = "exited";
      session.providerState = "exited";
      session.exitCode = Number.isFinite(Number(code)) ? Number(code) : null;
      revokeTerminalGatewayTokensForTerminal(session.id);
      const data = `\r\n[${label(session.agent)} exited${signal ? `: ${signal}` : session.exitCode !== null ? `: ${session.exitCode}` : ""}]\r\n`;
      appendOutput(session, data);
      publish(session.id, { type: "exit", data, code: session.exitCode, signal: signal || "" });
    }
  };
}

function publishPersistentOutput(session, data, meta = {}) {
  session.status = "running";
  appendOutput(session, data);
  publish(session.id, {
    type: "output",
    data,
    ...(meta.assignmentId ? { assignmentId: meta.assignmentId } : {}),
    ...(meta.emittedAt ? { emittedAt: meta.emittedAt } : {})
  });
}

export function closePtyTerminal(id) {
  const session = sessions.get(string(id));
  if (!session) return false;
  if (session.process) session.process.kill("SIGTERM");
  else removePersistentAiTerminalSession(session.id);
  sessions.delete(session.id);
  subscribers.delete(session.id);
  revokeTerminalGatewayTokensForTerminal(session.id);
  return true;
}

export function renamePtyTerminal(id, body = {}) {
  const session = sessions.get(string(id));
  if (!session) throw httpError(404, "Terminal not found.");
  const title = string(body.title).replace(/\s+/g, " ").trim().slice(0, 72);
  if (!title) throw httpError(422, "Enter a terminal name.");
  session.title = title;
  session.updatedAt = new Date().toISOString();
  updatePersistentAiTerminalSession(session.id, { title });
  publish(session.id, { type: "session", session: publicSession(session), output: session.output });
  return publicSession(session);
}

export function switchPtyTerminalModel(id, body = {}) {
  const session = sessions.get(string(id));
  if (!session) throw httpError(404, "Terminal not found.");
  const model = string(body.model).trim().slice(0, 140);
  if (model === session.model) return publicSession(session);
  throw httpError(409, "Changing a terminal model requires a new terminal session.");
}

export function closeAllPtyTerminals() {
  const ids = Array.from(sessions.keys());
  ids.forEach(closePtyTerminal);
  return ids.length;
}

async function restorePersistentSessions() {
  await discoverProjects();
  for (const record of listPersistentAiTerminalSessions().slice(0, MAX_PTY_TERMINAL_SESSIONS)) {
    const config = record.config;
    const workerState = record.state;
    if (!persistentAiTerminalConfigIsCurrent(config)) {
      terminateUntrustedPersistentSession(config.terminalId);
      continue;
    }
    const location = await restoredTerminalLocation(config);
    if (!location) {
      terminateUntrustedPersistentSession(config.terminalId);
      continue;
    }
    const agent = normalizeAgent(config.agent, config.model);
    const restoredTeam = normalizeRestoredTeam(config.team, config.launchPlan?.runtimeId);
    if (config.team && !restoredTeam) {
      terminateUntrustedPersistentSession(config.terminalId);
      continue;
    }
    const session = {
      id: string(config.terminalId),
      title: string(config.title).slice(0, 72) || "Recovered terminal",
      agent,
      agentStatus: aiTerminalAgentStatus(agent, config.model, config.launchPlan?.runtimeId),
      requestedModel: string(config.requestedModel || config.model).slice(0, 140),
      model: string(config.model).slice(0, 140),
      autoRouting: config.autoRouting || null,
      reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
      permissionMode: restoredTeam?.permissionMode
        || normalizePermissionMode(config.permissionMode, agent),
      sandboxMode: restoredTeam?.sandboxMode
        || string(config.sandboxMode)
        || config.launchPlan?.sandboxMode
        || "workspace-write",
      tokenMode: normalizeTokenMode(config.tokenMode),
      launchPlan: config.launchPlan || null,
      team: restoredTeam,
      projectId: location.projectId,
      workspaceMode: location.workspaceMode,
      branchName: location.branchName,
      workspacePath: location.workspacePath,
      repositoryRoot: location.repositoryRoot,
      workspaceNotice: string(config.workspaceNotice),
      cwd: location.cwd,
      cols: clamp(config.cols, 100),
      rows: clamp(config.rows, 30),
      output: String(record.output || "").slice(-MAX_OUTPUT_BUFFER),
      status: String(workerState.status || "exited"),
      providerState: normalizeProviderState(workerState.providerState)
        || (workerState.status === "exited" ? "exited" : "starting"),
      exitCode: workerState.exitCode ?? null,
      createdAt: config.createdAt || workerState.createdAt || new Date().toISOString(),
      updatedAt: workerState.updatedAt || new Date().toISOString(),
      process: null
    };
    if (!session.id || sessions.has(session.id)) continue;
    sessions.set(session.id, session);
    if (session.status !== "exited") {
      session.process = connectPersistentAiTerminalProcess(
        session.id,
        persistentHandlers(session),
        { waitForWorker: true }
      );
    }
  }
}

export async function restoredTerminalLocation(config = {}) {
  const projectId = string(config.projectId);
  const project = projectId ? terminalProjectById(projectId) : null;
  if (projectId && !project) return null;
  const workspaceMode = normalizeTerminalWorkspaceMode(config.workspaceMode);
  if (workspaceMode === "worktree") {
    const workspace = await restoredTerminalWorkspace(config, project);
    return workspace ? { projectId, ...workspace } : null;
  }
  const cwd = resolve(project?.path || process.cwd());
  const savedCwd = resolve(string(config.cwd) || process.cwd());
  return savedCwd === cwd ? {
    projectId,
    workspaceMode: "shared",
    branchName: "",
    workspacePath: "",
    repositoryRoot: "",
    workspaceNotice: "",
    cwd
  } : null;
}

function terminateUntrustedPersistentSession(terminalId) {
  const id = string(terminalId);
  if (!id) return;
  revokeTerminalGatewayTokensForTerminal(id);
  connectPersistentAiTerminalProcess(id, {}, { waitForWorker: true }).kill("SIGTERM");
}

export function listPtyTerminals() {
  return Array.from(sessions.values()).map(publicSession);
}

export function terminalEditorWorkspace(id) {
  const session = sessions.get(string(id));
  if (!session) throw httpError(404, "Terminal not found.");
  if (!session.cwd) throw httpError(409, "This terminal does not have a workspace yet.");
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    branchName: session.branchName,
    workspaceMode: session.workspaceMode
  };
}

async function writePtyInput(id, input) {
  const session = sessions.get(string(id));
  if (session?.autoAwaitingTask) {
    const consumed = consumeAutoTerminalInput({
      buffer: session.autoInputBuffer,
      pasteMode: session.autoPasteMode
    }, input);
    session.autoInputBuffer = consumed.buffer;
    session.autoPasteMode = consumed.pasteMode;
    if (consumed.output) {
      appendOutput(session, consumed.output);
      publish(session.id, { type: "output", data: consumed.output });
    }
    if (consumed.prompt) {
      await activateAutoTerminal(session, consumed.prompt, `auto-${session.id}-${Date.now()}`);
    } else if (/[\r\n]/.test(input)) {
      appendAutoOutput(session, autoTerminalPrompt());
    }
    return;
  }
  if (!session?.process?.stdin?.writable) throw httpError(409, "Terminal is not running.");
  session.process.stdin.write(input);
  session.updatedAt = new Date().toISOString();
}

export async function assignPtyTerminalTask(id, body = {}, options = {}) {
  const session = sessions.get(string(id));
  if (!session) throw httpError(404, "Terminal not found.");
  const assignmentId = string(body.assignmentId).slice(0, 160);
  const prompt = sanitizeAssignmentPrompt(body.prompt);
  if (!assignmentId) throw httpError(422, "Assignment ID is required.");
  if (!prompt) throw httpError(422, "Assignment prompt is required.");
  if (session.autoAwaitingTask) {
    return activateAutoTerminal(
      session,
      prompt,
      assignmentId,
      options.timeoutMs ?? 20_000
    );
  }
  if (session.agent === "shell" || session.providerState === "fallback-shell") {
    return rejectedAssignment(session, assignmentId, "The terminal is a project shell and cannot accept AI assignments.");
  }
  if (session.providerState === "exited" || session.status === "exited" || !session.process?.assign) {
    return rejectedAssignment(session, assignmentId, "The AI provider is not running.");
  }
  const acknowledgement = await session.process.assign({
    assignmentId,
    data: formatAssignmentInput(session.agent, prompt),
    timeoutMs: options.timeoutMs ?? ASSIGNMENT_TIMEOUT_MS
  });
  session.providerState = normalizeProviderState(acknowledgement.providerState)
    || session.providerState;
  session.updatedAt = new Date().toISOString();
  return {
    assignmentId,
    terminalId: session.id,
    state: acknowledgement.state,
    providerState: session.providerState,
    duplicate: Boolean(acknowledgement.duplicate),
    ...(acknowledgement.reason ? { reason: acknowledgement.reason } : {})
  };
}

export function formatPtyTerminalAssignment(agent, prompt) {
  return formatAssignmentInput(
    normalizeAgent(agent),
    sanitizeAssignmentPrompt(prompt)
  );
}

function formatAssignmentInput(agent, prompt) {
  return `\x1b[200~${prompt.replace(/\r?\n/g, "\r")}\x1b[201~\r`;
}

function sanitizeAssignmentPrompt(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_ASSIGNMENT_PROMPT);
}

function rejectedAssignment(session, assignmentId, reason) {
  return {
    assignmentId,
    terminalId: session.id,
    state: "rejected",
    providerState: session.providerState,
    duplicate: false,
    reason
  };
}

function resizePtyTerminal(id, size) {
  const session = sessions.get(string(id));
  if (!session) return;
  const cols = clamp(size?.cols, session.cols || 100);
  const rows = clamp(size?.rows, session.rows || 30);
  if (session.cols === cols && session.rows === rows) return;
  session.cols = cols;
  session.rows = rows;
  session.updatedAt = new Date().toISOString();
  try { session.process?.resize?.(cols, rows); } catch {}
}

function subscribePtyTerminal(id, sendMessage) {
  const session = sessions.get(id);
  const list = subscribers.get(id) || new Set();
  const firstSubscriber = list.size === 0;
  list.add(sendMessage);
  subscribers.set(id, list);
  if (firstSubscriber) session?.process?.setRendererAttached?.(true);
  sendMessage({ type: "session", session: publicSession(session), output: session.output });
  return () => {
    list.delete(sendMessage);
    if (!list.size) {
      subscribers.delete(id);
      session?.process?.setRendererAttached?.(false);
    }
  };
}

export function handlePtySocketMessage(id, message) {
  let payload = null;
  try { payload = JSON.parse(message); } catch { return; }
  try {
    if (payload?.type === "input") {
      void writePtyInput(id, String(payload.data ?? "")).catch((error) => {
        if (Number(error?.status) !== 409) {
          console.error(error instanceof Error ? error.stack || error.message : error);
        }
      });
    }
    if (payload?.type === "resize") resizePtyTerminal(id, payload);
  } catch (error) {
    if (Number(error?.status) !== 409) {
      console.error(error instanceof Error ? error.stack || error.message : error);
    }
  }
}

function ptyRoute(pathname) {
  if (pathname === "/desktop/pty-terminals" || pathname === "/desktop/pty-terminals/") return { action: "collection" };
  if (pathname === "/desktop/pty-terminals/close-all") return { action: "close-all" };
  if (pathname === "/desktop/pty-terminals/workspace/preflight") return { action: "workspace-preflight" };
  if (pathname === "/desktop/pty-terminals/workspace/checkpoint") return { action: "workspace-checkpoint" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "desktop" || parts[1] !== "pty-terminals") return null;
  if (parts.length === 3) return { action: "session", id: decodeURIComponent(parts[2]) };
  if (parts.length === 4 && parts[3] === "socket") return { action: "socket", id: decodeURIComponent(parts[2]) };
  if (parts.length === 4) return { action: parts[3], id: decodeURIComponent(parts[2]) };
  return null;
}

function publicSession(session) {
  if (!session) return null;
  const {
    process,
    autoInputBuffer,
    autoPasteMode,
    autoTitle,
    autoRoutingPromise,
    ...safe
  } = session;
  return {
    ...safe,
    ...publicTeam(session.team)
  };
}

function assertTeamRoleAvailable(team, context = {}) {
  if (!team) return;
  for (const session of sessions.values()) {
    if (session.id === context.terminalId || session.team?.teamId !== team.teamId) continue;
    if (
      session.team.teamSize !== team.teamSize
      || session.projectId !== context.projectId
      || session.model !== context.model
      || session.tokenMode !== context.tokenMode
    ) {
      throw httpError(409, "That Team is already running with different launch settings.");
    }
    if (session.team.roleKey === team.roleKey) {
      throw httpError(409, `The ${team.roleTitle} role is already running for this Team.`);
    }
  }
}

function normalizeRestoredTeam(value, runtimeId) {
  if (!value || typeof value !== "object") return null;
  try {
    return normalizeTerminalTeamLaunch({
      teamId: value.teamId,
      teamSize: value.teamSize,
      teamRoleKey: value.roleKey,
      teamGoal: value.goal,
      teamPlanId: value.planId,
      teamAssignment: value.assignment,
      permissionMode: value.permissionMode
    }, runtimeId || "");
  } catch {
    return null;
  }
}

function publicTeam(team) {
  if (!team) return {};
  return {
    teamId: team.teamId,
    teamSize: team.teamSize,
    teamGoal: team.goal,
    teamRole: team.roleTitle,
    teamRoleKey: team.roleKey,
    teamPhase: team.phase,
    teamCapability: team.capability,
    teamRoleContractVersion: team.contractVersion,
    teamRolePolicyHash: team.rolePolicyHash,
    teamPlanId: team.planId || "",
    teamPlannerMode: team.plannerMode || "",
    teamPlannerModel: team.plannerModel || "",
    teamPlannerFallbackReason: team.plannerFallbackReason || ""
  };
}

function appendOutput(session, data) {
  session.output = (session.output + String(data || "")).slice(-MAX_OUTPUT_BUFFER);
  session.updatedAt = new Date().toISOString();
}

function publish(id, payload) {
  for (const sendMessage of subscribers.get(id) || []) sendMessage(payload);
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
}

function sendFrame(socket, text) {
  const body = Buffer.from(text);
  if (body.length < 126) {
    socket.write(Buffer.concat([Buffer.from([129, body.length]), body]));
    return;
  }
  if (body.length <= 0xffff) {
    socket.write(Buffer.concat([Buffer.from([129, 126, body.length >> 8, body.length & 255]), body]));
    return;
  }
  const head = Buffer.alloc(10);
  head[0] = 129;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(body.length), 2);
  socket.write(Buffer.concat([head, body]));
}

function readFrames(buffer, fragments = []) {
  const messages = [];
  let offset = 0;
  let nextFragments = fragments;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = Boolean(first & 0x80);
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) break;
      length = Number(bigLength);
      cursor += 8;
    }
    const maskOffset = cursor;
    if (masked) cursor += 4;
    if (cursor + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    }
    if (opcode === 8) return { messages, remaining: Buffer.alloc(0), fragments: [] };
    if (opcode === 1 || opcode === 2) {
      if (fin) messages.push(payload.toString("utf8"));
      else nextFragments = [payload];
    } else if (opcode === 0 && nextFragments.length) {
      nextFragments = [...nextFragments, payload];
      if (fin) {
        messages.push(Buffer.concat(nextFragments).toString("utf8"));
        nextFragments = [];
      }
    }
    offset = cursor + length;
  }
  return { messages, remaining: buffer.subarray(offset), fragments: nextFragments };
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function normalizeAgent(value, model = "") {
  const next = string(value).toLowerCase() || "vibyra";
  if (next === "official") return availableOfficialAgentForModel(model) || "vibyra";
  return agents.has(next) ? next : "vibyra";
}

function availableOfficialAgentForModel(model) {
  const agent = officialAgentForModel(model);
  return agent && aiTerminalAgentStatus(agent).available ? agent : "";
}

export function terminalAgentForModel(model) {
  return officialAgentForModel(model);
}

export function terminalAgentForTokenSource(model, tokenMode, accounts = {}, requestedAgent = "") {
  const requested = normalizeAgent(requestedAgent, model);
  if (requested === "shell") return "shell";
  const key = string(model);
  if (!key) return requested;
  if (normalizeTokenMode(tokenMode) !== "provider") return "vibyra";

  const official = officialAgentForModel(key);
  if (official === "codex" && accounts?.codex?.available && accounts?.codex?.connected) {
    return "codex";
  }
  if (["claude", "gemini"].includes(official) && aiTerminalAgentStatus(official).available) {
    return official;
  }
  if (official === "codex") {
    httpError(409, "Install Codex CLI and sign in with ChatGPT before using My AI accounts.");
  }
  if (official) {
    httpError(409, `Install ${official === "claude" ? "Claude Code" : "Gemini CLI"} before using this model with My AI accounts.`);
  }
  httpError(409, "This model is only available with Vibyra tokens.");
}

function officialAgentForModel(model) {
  const key = string(model).toLowerCase();
  if (key.startsWith("openai/")) return "codex";
  if (key.startsWith("anthropic/")) return "claude";
  if (key.startsWith("google/")) return "gemini";
  if (key.includes("/")) return "";
  if (key.startsWith("gpt-") || key.includes("codex")) return "codex";
  if (key.startsWith("claude-")) return "claude";
  if (key.startsWith("gemini-")) return "gemini";
  return "";
}

function normalizeReasoningEffort(value) {
  const effort = string(value) || "medium";
  return ["default", "low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeTokenMode(value) {
  const mode = string(value).toLowerCase();
  return ["vibyra", "provider"].includes(mode) ? mode : "vibyra";
}

function normalizePermissionMode(value, agent) {
  return agent !== "shell" && string(value).toLowerCase() === "full" ? "full" : "standard";
}

function clamp(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Math.min(240, Math.max(10, Number.isFinite(numeric) ? numeric : fallback));
}

function label(agent) {
  return agent === "claude" ? "Claude" : agent === "gemini" ? "Gemini" : agent === "shell" ? "Shell" : agent === "codex" ? "Codex" : "Vibyra";
}

function normalizeProviderState(value) {
  const state = string(value);
  return ["starting", "ready", "busy", "fallback-shell", "exited"].includes(state) ? state : "";
}

function managedTerminalProviders() {
  return terminalProviderAdapters()
    .filter((adapter) => adapter.managedCreditsReady && terminalRuntimeExecutable(adapter.runtimeId))
    .map((adapter) => adapter.providerId);
}

function autoWaitingAgentStatus() {
  return {
    key: "vibyra",
    label: "Vibyra",
    available: true,
    command: "",
    commandPath: "",
    args: [],
    installHint: "",
    agentEnginePath: "",
    agentEngineAvailable: false,
    runtimeId: "auto",
    launchMode: "deferred-auto"
  };
}

async function activateAutoTerminal(session, prompt, assignmentId, timeoutMs = 20_000) {
  if (session.autoRoutingPromise) return session.autoRoutingPromise;
  session.autoRoutingPromise = (async () => {
    session.autoAwaitingTask = false;
    session.autoDeciding = true;
    session.providerState = "busy";
    publish(session.id, { type: "session", session: publicSession(session), output: session.output });
    const decidingAnimation = startAutoDecidingAnimation(session);
    const allowedProviders = managedTerminalProviders();
    let gatewayToken = "";
    let providerOutputGate = null;
    try {
      if (!allowedProviders.length) {
        return resetAutoWaitingSession(
          session,
          assignmentId,
          "No native Vibyra terminal runtime is currently ready for Auto."
        );
      }

      const routed = await routeDesktopAutoModel({ prompt, allowedProviders });
      const model = string(routed.modelKey).slice(0, 140);
      const launchPlan = resolveAiTerminalLaunchPlan({
        model: "auto",
        billingMode: session.tokenMode,
        permissionMode: session.permissionMode,
        initialTask: prompt,
        routedModel: model
      });
      const agent = terminalAgentForTokenSource(model, session.tokenMode, providerAccountsState(), "vibyra");
      const agentStatus = aiTerminalAgentStatus(agent, model, launchPlan.runtimeId);
      if (!agentStatus.available) {
        throw httpError(409, agentStatus.installHint || "The selected native AI runtime is not available.");
      }
      const memoryInstructions = await officialTerminalMemory(agent, session.projectId);
      gatewayToken = issueTerminalGatewayToken(session.id, {
        models: launchPlan.allowedModels,
        runtimeId: launchPlan.runtimeId,
        providerId: launchPlan.providerId,
        adapterId: launchPlan.adapterId,
        protocol: launchPlan.protocol,
        nativeModel: launchPlan.nativeModel,
        billingModel: launchPlan.billingModel
      }).token;
      session.agent = agent;
      session.agentStatus = agentStatus;
      session.model = model;
      session.autoRouting = routed.autoRouting || null;
      session.launchPlan = launchPlan;
      session.title = routedTerminalTitle(model, session.autoTitle || session.title);
      session.status = "starting";
      session.providerState = "starting";
      session.updatedAt = new Date().toISOString();
      publish(session.id, { type: "session", session: publicSession(session), output: session.output });
      providerOutputGate = createAutoProviderOutputGate(session, decidingAnimation);
      session.process = launchPersistentAiTerminalProcess({
        agent,
        requestedModel: "auto",
        model,
        autoRouting: session.autoRouting,
        reasoningEffort: session.reasoningEffort,
        permissionMode: session.permissionMode,
        tokenMode: session.tokenMode,
        projectId: session.projectId,
        workspaceMode: session.workspaceMode,
        branchName: session.branchName,
        workspacePath: session.workspacePath,
        repositoryRoot: session.repositoryRoot,
        workspaceNotice: session.workspaceNotice,
        memoryInstructions,
        terminalGatewayToken: gatewayToken,
        launchPlan,
        terminalId: session.id,
        title: session.title,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        createdAt: session.createdAt
      }, persistentHandlers(session, { onData: providerOutputGate.onData }));
      const acknowledgement = await session.process.assign({
        assignmentId,
        data: formatAssignmentInput(agent, prompt),
        timeoutMs
      });
      session.providerState = normalizeProviderState(acknowledgement.providerState)
        || session.providerState;
      session.updatedAt = new Date().toISOString();
      return {
        assignmentId,
        terminalId: session.id,
        state: acknowledgement.state,
        providerState: session.providerState,
        duplicate: Boolean(acknowledgement.duplicate),
        ...(acknowledgement.reason ? { reason: acknowledgement.reason } : {})
      };
    } catch (error) {
      providerOutputGate?.cancel();
      decidingAnimation.stop();
      if (gatewayToken) revokeTerminalGatewayTokensForTerminal(session.id);
      if (session.process) {
        session.process.kill("SIGTERM");
        session.process = null;
      }
      return resetAutoWaitingSession(
        session,
        assignmentId,
        error instanceof Error ? error.message : "Vibyra could not route this task."
      );
    }
  })();
  try {
    return await session.autoRoutingPromise;
  } finally {
    session.autoRoutingPromise = null;
  }
}

function createAutoProviderOutputGate(session, decidingAnimation) {
  const queued = [];
  let minimumMet = false;
  let released = false;
  const timeout = setTimeout(() => release(true), 30_000);
  timeout.unref?.();
  void decidingAnimation.waitForMinimum().then(() => {
    minimumMet = true;
    release(false);
  });

  function release(force) {
    if (released || !minimumMet || (!force && !queued.length)) return;
    released = true;
    clearTimeout(timeout);
    session.autoDeciding = false;
    decidingAnimation.handoff();
    for (const item of queued.splice(0)) {
      publishPersistentOutput(session, item.data, item.meta);
    }
  }

  return {
    onData(data, meta = {}) {
      if (released) return false;
      queued.push({ data, meta });
      release(false);
      return true;
    },
    cancel() {
      if (released) return;
      released = true;
      clearTimeout(timeout);
      queued.length = 0;
    }
  };
}

function startAutoDecidingAnimation(session) {
  const startedAt = Date.now();
  const firstFrame = autoTerminalDecidingStart({
    cols: session.cols,
    rows: session.rows
  });
  appendAutoOutput(session, firstFrame.output);
  let phase = 1;
  const timer = setInterval(() => {
    if (!sessions.has(session.id) || !session.autoDeciding) return;
    publish(session.id, {
      type: "output",
      data: autoTerminalDecidingUpdate({
        cols: session.cols,
        rows: session.rows,
        phase
      })
    });
    phase += 1;
  }, AUTO_DECIDING_FRAME_INTERVAL_MS);
  timer.unref?.();
  let stopped = false;
  return {
    async waitForMinimum() {
      const remaining = AUTO_DECIDING_MINIMUM_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      publish(session.id, { type: "output", data: autoTerminalDecidingStop() });
    },
    handoff() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      replaceAutoOutput(session, autoTerminalDecidingHandoff());
    }
  };
}

function resetAutoWaitingSession(session, assignmentId, reason) {
  session.agent = "vibyra";
  session.agentStatus = autoWaitingAgentStatus();
  session.model = "auto";
  session.autoRouting = null;
  session.launchPlan = null;
  session.title = session.autoTitle || session.title || "Auto";
  session.status = "running";
  session.providerState = "ready";
  session.autoAwaitingTask = true;
  session.autoDeciding = false;
  session.autoInputBuffer = "";
  session.autoPasteMode = false;
  replaceAutoOutput(session, `\x1b[0m\x1b[?25h\x1b[3J\x1b[2J\x1b[H${autoTerminalWaitingOutput({
    cwd: session.cwd,
    cols: session.cols,
    error: reason
  })}`);
  return rejectedAssignment(session, assignmentId, reason);
}

function appendAutoOutput(session, data) {
  appendOutput(session, data);
  publish(session.id, { type: "output", data });
  publish(session.id, { type: "session", session: publicSession(session), output: session.output });
}

function replaceAutoOutput(session, data) {
  session.output = String(data || "").slice(-MAX_OUTPUT_BUFFER);
  session.updatedAt = new Date().toISOString();
  publish(session.id, {
    type: "session",
    session: publicSession(session),
    output: session.output,
    replaceOutput: true
  });
}

function routedTerminalTitle(model, requestedTitle) {
  const requested = string(requestedTitle);
  if (requested && !/^(?:auto|terminal)(?: \d+)?$/i.test(requested)) {
    return requested.slice(0, 72);
  }
  const raw = string(model).replace(/^[^/]+\//, "");
  const words = raw.split(/[-_]+/).filter(Boolean).map((word) => {
    if (/^gpt$/i.test(word)) return "GPT";
    if (/^\d+(?:\.\d+)*$/.test(word)) return word;
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
  const ordinal = string(requestedTitle).match(/\s(\d+)$/)?.[1] || "";
  return `${words.join("-").replace(/-(Mini|Nano|Codex)$/i, " $1")}${ordinal ? ` ${ordinal}` : ""}`
    .trim()
    .slice(0, 72) || "Terminal";
}

function string(value) {
  return String(value ?? "").trim();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
