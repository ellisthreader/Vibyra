import {
  createDesktopMemoryNode,
  deleteDesktopMemoryNode,
  getDesktopMemoryVault,
  importDesktopMemoryManifest,
  updateDesktopMemoryNode
} from "./desktopMemoryVault.mjs";
import { addDesktopProjectMemory, deleteDesktopProjectMemory, getDesktopProjectMemory } from "./desktopProjectMemory.mjs";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { readBody, send } from "./http.mjs";

export async function handleDesktopMemoryRoutes(req, res, url) {
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
  if (req.method === "GET" && url.pathname === "/desktop/project-memory/vault") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, await getDesktopMemoryVault(url.searchParams.get("projectId")));
    return true;
  }
  if (req.method === "POST" && ["/desktop/project-memory/node", "/desktop/project-memory/nodes"].includes(url.pathname)) {
    if (!authorizeDesktopUi(req, res)) return true;
    const body = await readBody(req);
    send(res, 200, await createDesktopMemoryNode(body.projectId, body));
    return true;
  }
  const nodePath = url.pathname.match(/^\/desktop\/project-memory\/nodes\/([^/]+)$/);
  if ((req.method === "PATCH" || req.method === "DELETE") && (url.pathname === "/desktop/project-memory/node" || nodePath)) {
    if (!authorizeDesktopUi(req, res)) return true;
    const body = await readBody(req);
    const projectId = body.projectId || url.searchParams.get("projectId");
    const nodeId = nodePath ? decodeURIComponent(nodePath[1]) : body.nodeId || url.searchParams.get("nodeId");
    if (req.method === "DELETE" && body.recursive === undefined && url.searchParams.has("recursive")) {
      body.recursive = ["1", "true"].includes(String(url.searchParams.get("recursive")).toLowerCase());
    }
    const payload = req.method === "PATCH"
      ? await updateDesktopMemoryNode(projectId, nodeId, body)
      : await deleteDesktopMemoryNode(projectId, nodeId, body);
    send(res, 200, payload);
    return true;
  }
  if (req.method === "POST" && ["/desktop/project-memory/import", "/desktop/project-memory/imports"].includes(url.pathname)) {
    if (!authorizeDesktopUi(req, res)) return true;
    const body = await readBody(req);
    send(res, 200, await importDesktopMemoryManifest(body.projectId, body));
    return true;
  }
  return false;
}
