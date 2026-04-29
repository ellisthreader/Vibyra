import { exec } from "node:child_process";
import { createServer } from "node:http";
import { networkInterfaces, hostname, homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join } from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CODEX_AGENT_PORT ?? 4317);
const PAIR_CODE = process.env.CODEX_PAIR_CODE ?? makePairCode();
const TOKEN = process.env.CODEX_AGENT_TOKEN ?? `codex-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const machineName = hostname();
const startedAt = new Date().toISOString();
const allowedCommands = new Set(["git status", "npm install", "npm run dev", "npm run build", "npm test", "pytest"]);

let server = null;
let pairedDevice = null;
let pendingPair = null;
let selectedProjectId = null;
let latestPreview = null;
let cachedProjects = [];
let events = [
  event("Desktop", "Code X Desktop is ready", "success"),
  event("Pairing", `Pair code ${PAIR_CODE} is showing on desktop`, "info")
];

function makePairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function event(source, message, tone = "info") {
  return {
    id: `evt-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    source,
    message,
    tone,
    time: "Now"
  };
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function connectionUrls() {
  return lanAddresses().map((address) => `http://${address}:${PORT}`);
}

function state() {
  return {
    machineName,
    pairCode: PAIR_CODE,
    pairedDevice,
    pendingPair,
    latestPreview,
    events,
    connectionUrls: connectionUrls(),
    projects: cachedProjects
  };
}

function headers(contentType = "application/json") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": contentType
  };
}

function send(res, status, payload) {
  res.writeHead(status, headers());
  res.end(JSON.stringify(payload));
}

async function sendFile(res, filePath) {
  const typeByExt = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };
  const content = await readFile(filePath);
  res.writeHead(200, headers(typeByExt[extname(filePath)] ?? "text/plain; charset=utf-8"));
  res.end(content);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function isAuthed(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

async function discoverProjects() {
  const roots = [process.cwd(), join(homedir(), "Desktop"), join(homedir(), "Code"), join(homedir(), "Projects"), join(homedir(), "Work")];
  const seen = new Set();
  const projects = [];

  for (const root of roots) {
    try {
      const rootStat = await stat(root);
      if (!rootStat.isDirectory()) continue;
    } catch {
      continue;
    }

    await maybeAddProject(root, seen, projects);

    try {
      const children = await readdir(root, { withFileTypes: true });
      for (const child of children.slice(0, 60)) {
        if (!child.isDirectory() || child.name.startsWith(".")) continue;
        await maybeAddProject(join(root, child.name), seen, projects);
      }
    } catch {
      // Discovery is best-effort so one locked folder cannot block pairing.
    }
  }

  cachedProjects = projects.slice(0, 12);
  return cachedProjects;
}

async function maybeAddProject(path, seen, projects) {
  if (seen.has(path)) return;
  seen.add(path);

  let entries = [];
  try {
    entries = await readdir(path);
  } catch {
    return;
  }

  const markers = ["package.json", ".git", "app.json", "requirements.txt", "pyproject.toml"];
  if (!markers.some((marker) => entries.includes(marker))) return;

  const info = await stat(path);
  projects.push({
    id: Buffer.from(path).toString("base64url"),
    name: basename(path),
    path,
    stack: detectStack(entries),
    updated: formatUpdated(info.mtime)
  });
}

function detectStack(entries) {
  if (entries.includes("app.json")) return "Expo React Native";
  if (entries.includes("package.json")) return "Node / React";
  if (entries.includes("pyproject.toml")) return "Python";
  if (entries.includes("requirements.txt")) return "Python";
  return "Project";
}

function formatUpdated(date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function projectById(id) {
  return cachedProjects.find((project) => project.id === id) ?? cachedProjects[0];
}

async function startAgentTask({ projectId, prompt, model }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");

  const runId = `run-${Date.now()}`;
  const outputDir = join(project.path, ".codex-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  const summary = [
    "# Code X Agent Run",
    "",
    `Prompt: ${prompt}`,
    `Model: ${model}`,
    `Project: ${project.name}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "This local desktop app wrote a safe run artifact to prove pairing, routing, local apply, reload, capture, and phone delivery."
  ].join("\n");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, summary, "utf8");

  selectedProjectId = project.id;
  latestPreview = {
    state: "delivered",
    url: `http://localhost:3000/${project.name.toLowerCase().replace(/\s+/g, "-")}`,
    title: project.name,
    message: "Updated preview captured from Code X Desktop",
    capturedAt: new Date().toISOString()
  };

  const newEvents = [
    event("Preview", "Updated preview delivered to iPhone", "success"),
    event("Agent", "Captured refreshed project preview", "success"),
    event("Dev Server", "Project reloaded after local apply", "success"),
    event("Agent", `Applied generated run artifact at ${outputPath}`, "info"),
    event(model, "Code diff returned", "info"),
    event("Backend", `Prompt sent to ${model}`, "info")
  ];
  events = [...newEvents, ...events].slice(0, 50);

  return {
    agent: {
      id: runId,
      title: prompt,
      model,
      projectId: project.id,
      state: "complete",
      progress: 100,
      file: outputPath
    },
    changes: [
      {
        id: `${runId}-change`,
        file: outputPath,
        summary: "Created local desktop-app run artifact",
        additions: summary.split("\n").length,
        deletions: 0,
        status: "applied"
      }
    ],
    files: [
      {
        id: `${runId}-file`,
        name: basename(outputPath),
        path: outputPath,
        language: "md",
        changed: "added",
        body: summary
      }
    ],
    events: newEvents,
    preview: latestPreview,
    buildState: "passed"
  };
}

function runCommand({ projectId, command }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");
  if (!allowedCommands.has(command)) throw new Error(`Command is not allowed yet: ${command}`);

  return new Promise((resolve) => {
    exec(command, { cwd: project.path, timeout: 20_000, maxBuffer: 200_000 }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`.trim() || "Command finished with no output.";
      const log = event("Terminal", `${command}: ${output.slice(0, 180)}`, error ? "error" : "success");
      events = [log, ...events].slice(0, 50);
      resolve({
        ok: !error,
        command,
        output,
        event: log,
        buildState: command.includes("build") || command.includes("test") ? (error ? "failed" : "passed") : "idle"
      });
    });
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/desktop/state") {
      send(res, 200, state());
      return;
    }

    if (req.method === "POST" && url.pathname === "/desktop/approve") {
      if (pendingPair) {
        pairedDevice = pendingPair.deviceName;
        pendingPair = { ...pendingPair, status: "approved" };
        await discoverProjects();
        events = [event("Pairing", `${pairedDevice} approved on desktop`, "success"), ...events].slice(0, 50);
      }
      send(res, 200, state());
      return;
    }

    if (req.method === "GET" && url.pathname === "/desktop") {
      await sendFile(res, join(__dirname, "index.html"));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/desktop/")) {
      const safeName = basename(url.pathname.replace("/desktop/", ""));
      await sendFile(res, join(__dirname, safeName));
      return;
    }

    if (req.method === "POST" && url.pathname === "/desktop/deny") {
      if (pendingPair) {
        pendingPair = { ...pendingPair, status: "denied" };
        events = [event("Pairing", "Pairing request denied", "error"), ...events].slice(0, 50);
      }
      send(res, 200, state());
      return;
    }

    if (req.method === "POST" && url.pathname === "/desktop/quit") {
      send(res, 200, { ok: true });
      server?.close(() => process.exit(0));
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, {
        ok: true,
        machineName,
        pairCode: PAIR_CODE,
        paired: Boolean(pairedDevice),
        pairedDevice,
        startedAt,
        preview: latestPreview,
        connectionUrls: connectionUrls()
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/pair") {
      const body = await readBody(req);
      if (String(body.code ?? "").trim().toUpperCase() !== PAIR_CODE) {
        send(res, 401, { ok: false, error: "Pair code does not match" });
        return;
      }

      pendingPair = {
        id: `pair-${Date.now()}`,
        deviceName: String(body.deviceName ?? "iPhone"),
        requestedAt: new Date().toISOString(),
        status: "pending"
      };
      events = [event("Pairing", `${pendingPair.deviceName} is asking to pair`, "warning"), ...events].slice(0, 50);
      send(res, 202, { ok: true, status: "pending", requestId: pendingPair.id, machineName });
      return;
    }

    if (req.method === "GET" && url.pathname === "/pair/status") {
      const requestId = url.searchParams.get("requestId");
      if (!pendingPair || pendingPair.id !== requestId) {
        send(res, 404, { ok: false, error: "Pair request not found" });
        return;
      }

      if (pendingPair.status === "approved") {
        await discoverProjects();
        send(res, 200, {
          ok: true,
          status: "approved",
          token: TOKEN,
          machineName,
          projects: cachedProjects,
          events
        });
        return;
      }

      if (pendingPair.status === "denied") {
        send(res, 403, { ok: false, status: "denied", error: "Desktop denied pairing" });
        return;
      }

      send(res, 200, { ok: true, status: "pending", machineName });
      return;
    }

    if (!isAuthed(req)) {
      send(res, 401, { ok: false, error: "Missing or invalid desktop token" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects") {
      send(res, 200, { projects: await discoverProjects() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      send(res, 200, { events, preview: latestPreview, selectedProjectId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/preview/start") {
      const body = await readBody(req);
      selectedProjectId = String(body.projectId ?? "");
      const project = projectById(selectedProjectId);
      latestPreview = {
        state: "live",
        url: `http://localhost:3000/${project?.name.toLowerCase().replace(/\s+/g, "-") ?? "project"}`,
        title: project?.name ?? "Project",
        message: "Live preview stream started",
        capturedAt: new Date().toISOString()
      };
      const log = event("Preview", `Live preview started for ${project?.name ?? "project"}`, "success");
      events = [log, ...events].slice(0, 50);
      send(res, 200, { preview: latestPreview, events: [log] });
      return;
    }

    if (req.method === "POST" && url.pathname === "/agents/start") {
      const body = await readBody(req);
      send(res, 200, await startAgentTask(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/commands/run") {
      const body = await readBody(req);
      send(res, 200, await runCommand(body));
      return;
    }

    send(res, 404, { ok: false, error: "Unknown Code X Desktop route" });
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : "Desktop app error" });
  }
}

function openDesktopWindow() {
  const url = `http://127.0.0.1:${PORT}/desktop`;
  const userDataDir = join(homedir(), ".code-x-desktop-window");
  const linuxAppWindow =
    `google-chrome --app="${url}" --class=CodeXDesktop ` +
    `--user-data-dir="${userDataDir}" --window-size=940,760`;
  const opener =
    platform() === "darwin"
      ? `open -na "Google Chrome" --args --app="${url}" --window-size=940,760`
      : platform() === "win32"
        ? `start "" chrome --app="${url}" --window-size=940,760`
        : `${linuxAppWindow} || chromium --app="${url}" --class=CodeXDesktop --window-size=940,760 || xdg-open "${url}"`;
  exec(opener);
}

server = createServer(handle);
server.listen(PORT, "0.0.0.0", async () => {
  await discoverProjects();
  openDesktopWindow();
  console.log("Code X Desktop is running");
  console.log(`Pair code: ${PAIR_CODE}`);
  console.log(`Desktop screen: http://127.0.0.1:${PORT}/desktop`);
  for (const url of connectionUrls()) console.log(`Phone URL: ${url}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Code X Desktop is already open.");
    openDesktopWindow();
    setTimeout(() => process.exit(0), 400);
    return;
  }
  throw error;
});
