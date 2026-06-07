import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleAiTerminalRoutes } from "./aiTerminals.mjs";
import { handlePtyTerminalRoutes } from "./ptyTerminals.mjs";
import { sendSafeAsset } from "./assetRoutes.mjs";
import { sendDesktopChat } from "./desktopChat.mjs";
import { transcribeDesktopVoice } from "./desktopVoice.mjs";
import { openDesktopPreview } from "./desktopPreview.mjs";
import { addDesktopProjectMemory, deleteDesktopProjectMemory, getDesktopProjectMemory } from "./desktopProjectMemory.mjs";
import { startPhonePreview } from "./phonePreview.mjs";
import { clearDesktopAccount, verifyAndSetDesktopAccount } from "./desktopAccount.mjs";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { readBody, send, sendFile } from "./http.mjs";
import { openRouterModelPayload } from "./openRouterModels.mjs";
import { connectOpenAiAccount, disconnectOpenAiAccount, providerAccountsState } from "./providerAccounts.mjs";
import { analyzeDesktopProject, browseDesktopPath, discoverProjects, listDesktopFolders, searchDesktopProjects } from "./projects.mjs";
import { promptProjectContext } from "./projectContext.mjs";
import { appState, markPhoneConnected, publicState } from "./state.mjs";
import { approvePairing, denyPairing, isAuthed } from "./pairingHandlers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const appAssetsDir = join(__dirname, "..", "..", "src", "assets");
const desktopAssetsDir = join(desktopDir, "assets");

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
  if (req.method === "GET" && url.pathname === "/desktop/projects") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { projects: await discoverProjects() });
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
  if (req.method === "POST" && url.pathname === "/desktop/voice/transcribe") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await transcribeDesktopVoice(await readBody(req)));
    return true;
  }
  if (url.pathname === "/desktop/project-memory") {
    if (!authorizeDesktopUi(req, res)) return true;
    const projectId = url.searchParams.get("projectId");
    if (req.method === "GET") send(res, 200, { ok: true, memory: await getDesktopProjectMemory(projectId) });
    else if (req.method === "POST") send(res, 200, { ok: true, memory: await addDesktopProjectMemory(projectId, (await readBody(req)).text) });
    else return false;
    return true;
  }
  if (req.method === "DELETE" && url.pathname === "/desktop/project-memory/entry") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { ok: true, memory: await deleteDesktopProjectMemory(url.searchParams.get("projectId"), url.searchParams.get("entryId")) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/provider-accounts") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { providers: providerAccountsState() });
    return true;
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
  if (url.pathname === "/desktop/terminals" || url.pathname.startsWith("/desktop/terminals/")) {
    if (!authorizeDesktopUi(req, res)) return true;
    if (await handleAiTerminalRoutes(req, res, url)) return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/preview") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await openDesktopPreview(await readBody(req), req.headers.host));
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
    appState.server?.close(() => process.exit(0));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/session") {
    if (!authorizeDesktopUi(req, res)) return true;
    const token = bearerToken(req.headers.authorization);
    const account = await verifyAndSetDesktopAccount(token, req.headers["x-vibyra-public-ip"]);
    send(res, 200, { ok: true, user: account });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/session/clear") {
    if (!authorizeDesktopUi(req, res)) return true;
    clearDesktopAccount();
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop") {
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
  if (req.method === "GET" && url.pathname.startsWith("/desktop/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendFile(res, join(desktopDir, basename(url.pathname.replace("/desktop/", ""))));
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
