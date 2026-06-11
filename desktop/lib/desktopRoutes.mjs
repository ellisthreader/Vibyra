import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleAiTerminalRoutes } from "./aiTerminals.mjs";
import {
  terminalProviderAdapterForModel,
  terminalProviderIdForModel
} from "./aiTerminalProviderAdapters.mjs";
import { handleAiTerminalRuntimeRoutes } from "./aiTerminalRuntimeRoutes.mjs";
import { handlePtyTerminalRoutes } from "./ptyTerminals.mjs";
import { sendSafeAsset } from "./assetRoutes.mjs";
import { routeDesktopAutoModel, sendDesktopChat } from "./desktopChat.mjs";
import { proxyDesktopCodexResponse } from "./desktopCodexResponses.mjs";
import { proxyNativeTerminalProtocol } from "./desktopNativeTerminalGateway.mjs";
import { speakDesktopVoice, transcribeDesktopVoice } from "./desktopVoice.mjs";
import { appendDesktopPromptTranscript } from "./desktopPromptTranscript.mjs";
import {
  activateDesktopPreviewServer,
  desktopPreviewStartup,
  openDesktopPreview,
  startDesktopPreviewServer,
  stopDesktopPreviewServer
} from "./desktopPreview.mjs";
import { handleDesktopMemoryRoutes } from "./desktopMemoryRoutes.mjs";
import { handleTerminalEditorRoutes } from "./terminalEditor.mjs";
import { handleTerminalTeamRoutes } from "./terminalTeamRoutes.mjs";
import {
  pollDesktopProviderAuth,
  requestDesktopAuth,
  startDesktopProviderAuth
} from "./desktopAuthProxy.mjs";
import { startPhonePreview } from "./phonePreview.mjs";
import { stopAllTrackedPreviewServers } from "./previewServerProcesses.mjs";
import {
  clearDesktopAccount,
  persistDesktopAccountSession,
  removeDesktopAccountSession,
  verifyAndSetDesktopAccount
} from "./desktopAccount.mjs";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { headers, readBody, send, sendFile } from "./http.mjs";
import { openRouterModelPayload } from "./openRouterModels.mjs";
import { connectOpenAiAccount, disconnectOpenAiAccount, providerAccountsState } from "./providerAccounts.mjs";
import { localAiStatus } from "./localAi.mjs";
import { pairingQrSvg } from "./pairingQr.mjs";
import { analyzeDesktopProject, browseDesktopPath, discoverProjects, listDesktopFolders, searchDesktopProjects, selectDesktopProject } from "./projects.mjs";
import { promptProjectContext } from "./projectContext.mjs";
import { resolvePreviewElement } from "./previewElementResolver.mjs";
import { authorizeTerminalGatewayRequest } from "./terminalGatewayAuth.mjs";
import {
  appState,
  desktopRuntimeState,
  markPhoneConnected,
  publicState,
  requestRendererProtocolReload
} from "./state.mjs";
import { approvePairing, denyPairing, isAuthed } from "./pairingHandlers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const appAssetsDir = join(__dirname, "..", "..", "src", "assets");
const desktopAssetsDir = join(desktopDir, "assets");
const monacoAssetsDir = join(__dirname, "..", "..", "node_modules", "monaco-editor", "min", "vs");

export async function handleDesktopRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/desktop/folders") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, { folders: await listDesktopFolders() });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/search") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, { matches: await searchDesktopProjects(url.searchParams.get("q")) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/browse") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, await browseDesktopPath(url.searchParams.get("path")));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/analyze") { if (!authorizePhone(req, res)) return true; send(res, 200, { project: await analyzeDesktopProject(url.searchParams.get("path")) }); return true; }
  if (req.method === "GET" && url.pathname === "/desktop/context") { if (!authorizePhone(req, res)) return true; send(res, 200, await promptProjectContext(url.searchParams.get("projectId"), url.searchParams.get("q"))); return true; }
  if (req.method === "GET" && url.pathname === "/desktop/state") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/pair-qr.svg") {
    if (!authorizeDesktopUi(req, res, false)) return true;
    const svg = await pairingQrSvg();
    if (!svg) {
      send(res, 404, { ok: false, error: "No phone-reachable desktop address is available." });
      return true;
    }
    res.writeHead(200, headers("image/svg+xml; charset=utf-8"));
    res.end(svg);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/runtime") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, desktopRuntimeState(url.searchParams.get("rendererProtocolVersion")));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/runtime/renderer-mismatch") {
    if (!authorizeDesktopUi(req, res)) return true;
    const body = await readBody(req);
    send(res, 202, requestRendererProtocolReload(body.rendererProtocolVersion));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/projects") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { projects: await discoverProjects() });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/projects/search") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { projects: await searchDesktopProjects(url.searchParams.get("q")) });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/projects/select") {
    if (!authorizeDesktopUi(req, res)) return true;
    const project = await selectDesktopProject((await readBody(req)).path);
    send(res, 200, { project });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/openrouter-models") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await openRouterModelPayload());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/chat") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await sendDesktopChat(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/chat/route") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await routeDesktopAutoModel(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/v1/responses") {
    const body = await readBody(req);
    const providerAdapter = terminalProviderAdapterForModel(body.model);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      model: body.model,
      runtimeId: providerAdapter?.runtimeId,
      providerId: terminalProviderIdForModel(body.model),
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: body.model
    });
    if (!authorization) return true;
    const requestBody = {
      ...body,
      model: authorization.billingModel || body.model
    };
    await proxyDesktopCodexResponse(req, res, requestBody);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/grok/v1/chat/completions") {
    const body = await readBody(req);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      authSchemes: ["bearer"],
      model: body.model,
      runtimeId: "grok",
      providerId: "x-ai",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions",
      nativeModel: body.model,
      nativeModelAliases: ["grok-build"]
    });
    if (!authorization) return true;
    await proxyNativeTerminalProtocol(req, res, {
      protocol: "openai-chat-completions",
      billingModel: authorization.billingModel,
      body
    });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/qwen/v1/chat/completions") {
    const body = await readBody(req);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      authSchemes: ["bearer"],
      allowContainerNetwork: true,
      model: body.model,
      runtimeId: "qwen",
      providerId: "qwen",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions",
      nativeModel: body.model
    });
    if (!authorization) return true;
    await proxyNativeTerminalProtocol(req, res, {
      protocol: "openai-chat-completions",
      billingModel: authorization.billingModel,
      body
    });
    return true;
  }
  const nativeResponsesProvider = {
    "/desktop/kimi/v1/responses": {
      runtimeId: "kimi",
      providerId: "moonshot"
    },
    "/desktop/mistral/v1/responses": {
      runtimeId: "mistral",
      providerId: "mistral"
    }
  }[url.pathname];
  if (req.method === "POST" && nativeResponsesProvider) {
    const body = await readBody(req);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      authSchemes: ["bearer"],
      model: body.model,
      runtimeId: nativeResponsesProvider.runtimeId,
      providerId: nativeResponsesProvider.providerId,
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: body.model
    });
    if (!authorization) return true;
    const requestBody = {
      ...body,
      model: authorization.billingModel || body.model
    };
    await proxyDesktopCodexResponse(req, res, requestBody);
    return true;
  }
  if (req.method === "POST" && ["/desktop/anthropic/v1/messages", "/desktop/anthropic/v1/messages/count_tokens"].includes(url.pathname)) {
    const body = await readBody(req);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      authSchemes: ["bearer"],
      errorProtocol: "anthropic",
      model: body.model,
      runtimeId: "claude",
      providerId: "anthropic",
      adapterId: "anthropic-messages",
      protocol: "anthropic-messages",
      nativeModel: body.model
    });
    if (!authorization) return true;
    if (url.pathname.endsWith("/count_tokens")) {
      send(res, 200, { input_tokens: Math.max(1, Math.ceil(JSON.stringify(body).length / 4)) });
      return true;
    }
    await proxyNativeTerminalProtocol(req, res, {
      protocol: "anthropic",
      billingModel: authorization.billingModel,
      body
    });
    return true;
  }
  const geminiRoute = url.pathname.match(/^\/desktop\/gemini\/(?:v1|v1beta)\/models\/([^/:]+):(generateContent|streamGenerateContent|countTokens)$/);
  if (req.method === "POST" && geminiRoute) {
    const model = decodeURIComponent(geminiRoute[1]);
    const action = geminiRoute[2];
    const body = await readBody(req);
    const authorization = authorizeTerminalGatewayRequest(req, res, {
      authSchemes: ["x-goog-api-key", "bearer"],
      errorProtocol: "gemini",
      model,
      runtimeId: "gemini",
      providerId: "google",
      adapterId: "gemini-generate-content",
      protocol: "gemini-generate-content",
      nativeModel: model
    });
    if (!authorization) return true;
    if (action === "countTokens") {
      send(res, 200, { totalTokens: Math.max(1, Math.ceil(JSON.stringify(body).length / 4)) });
      return true;
    }
    await proxyNativeTerminalProtocol(req, res, {
      protocol: "gemini",
      billingModel: authorization.billingModel,
      body,
      streamResponse: action === "streamGenerateContent"
    });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/local-ai") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await localAiStatus());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/voice/transcribe") {
    if (!authorizeDesktopUi(req, res)) return true;
    const body = await readBody(req);
    const result = await transcribeDesktopVoice(body);
    const transcript = await appendDesktopPromptTranscript({ ...body, prompt: result.text });
    send(res, 200, { ...result, transcript });
    return true;
  }
  if (req.method === "POST" && ["/desktop/prompt/transcript", "/desktop/voice/transcript"].includes(url.pathname)) {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await appendDesktopPromptTranscript(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/voice/speak") {
    if (!authorizeDesktopUi(req, res)) return true;
    const speech = await speakDesktopVoice(await readBody(req));
    res.writeHead(200, headers(speech.contentType));
    res.end(speech.audio);
    return true;
  }
  if (url.pathname === "/desktop/project-memory" || url.pathname.startsWith("/desktop/project-memory/")) {
    if (await handleDesktopMemoryRoutes(req, res, url)) return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/provider-accounts") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { providers: providerAccountsState() });
    return true;
  }
  if (url.pathname === "/desktop/terminal-runtimes" || url.pathname.startsWith("/desktop/terminal-runtimes/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handleAiTerminalRuntimeRoutes(req, res, url)) return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/provider-accounts/openai") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { ok: true, account: await connectOpenAiAccount(await readBody(req)), providers: providerAccountsState() });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/provider-accounts/openai/disconnect") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { ok: true, account: disconnectOpenAiAccount(), providers: providerAccountsState() });
    return true;
  }
  if (url.pathname === "/desktop/pty-terminals" || url.pathname.startsWith("/desktop/pty-terminals/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handlePtyTerminalRoutes(req, res, url)) return true;
  }
  if (url.pathname === "/desktop/terminal-teams" || url.pathname.startsWith("/desktop/terminal-teams/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handleTerminalTeamRoutes(req, res, url)) return true;
  }
  if (url.pathname.startsWith("/desktop/terminal-editor/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handleTerminalEditorRoutes(req, res, url)) return true;
  }
  if (url.pathname === "/desktop/terminals" || url.pathname.startsWith("/desktop/terminals/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handleAiTerminalRoutes(req, res, url)) return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await openDesktopPreview(await readBody(req), req.headers.host));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview/start-server") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await startDesktopPreviewServer(await readBody(req), req.headers.host));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview/activate") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await activateDesktopPreviewServer(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview/stop-server") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await stopDesktopPreviewServer(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview/resolve-element") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await resolvePreviewElement(await readBody(req)));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/preview/startup") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, desktopPreviewStartup(url.searchParams.get("projectId"), url.searchParams.get("targetId")));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/phone-preview/start") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await startPhonePreview(await readBody(req), req.headers.host));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/approve") {
    if (!authorizeDesktopUi(req, res)) return true;
    await approvePairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/deny") {
    if (!authorizeDesktopUi(req, res)) return true;
    denyPairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/quit") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { ok: true });
    stopAllTrackedPreviewServers();
    appState.server?.close(() => process.exit(0));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/session") {
    if (!authorizeDesktopUi(req, res)) return true;
    const token = bearerToken(req.headers.authorization);
    const account = await verifyAndSetDesktopAccount(token, req.headers["x-vibyra-public-ip"]);
    persistDesktopAccountSession(token, account);
    send(res, 200, { ok: true, user: account });
    return true;
  }
  const providerStart = url.pathname.match(/^\/desktop\/auth\/(apple|google)\/start$/);
  if (req.method === "POST" && providerStart) {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await startDesktopProviderAuth(providerStart[1], await readBody(req)));
    return true;
  }
  const providerStatus = url.pathname.match(/^\/desktop\/auth\/(apple|google)\/status\/([A-Za-z0-9]+)$/);
  if (req.method === "GET" && providerStatus) {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await pollDesktopProviderAuth(providerStatus[1], providerStatus[2]));
    return true;
  }
  if (req.method === "POST" && url.pathname.startsWith("/desktop/auth/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await requestDesktopAuth(url.pathname.slice("/desktop/auth/".length), await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/session/clear") {
    if (!authorizeDesktopUi(req, res)) return true;
    clearDesktopAccount();
    removeDesktopAccountSession();
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "GET" && (url.pathname === "/desktop" || url.pathname === "/desktop/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendFile(res, join(desktopDir, "app.html"));
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/app-assets/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendSafeAsset(res, appAssetsDir, url.pathname, "/app-assets/");
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/desktop/assets/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendSafeAsset(res, desktopAssetsDir, url.pathname, "/desktop/assets/");
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/desktop/vendor/monaco/vs/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendSafeAsset(res, monacoAssetsDir, url.pathname, "/desktop/vendor/monaco/vs/");
    return true;
  }
  const desktopFileRoute = url.pathname.match(/^\/desktop\/([^/]+)$/);
  if (req.method === "GET" && desktopFileRoute) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendFile(res, join(desktopDir, basename(desktopFileRoute[1])));
    return true;
  }
  return false;
}

export function authorizePhone(req, res) {
  if (!isAuthed(req)) { send(res, 401, { ok: false, error: "Missing or invalid desktop token" }); return false; }
  markPhoneConnected();
  return true;
}

function bearerToken(header) {
  const value = String(header || "");
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}
