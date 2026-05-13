const emptyState = {
  machineName: "Vibyra Desktop",
  pairCode: "------",
  pairedDevice: null,
  pendingPair: null,
  events: [],
  projects: [],
  connectionUrls: []
};

let currentState = emptyState;
let posting = false;

const nodes = {
  approval: document.getElementById("approval"),
  approvalTitle: document.getElementById("approval-title"),
  approve: document.getElementById("approve"),
  deny: document.getElementById("deny"),
  events: document.getElementById("events"),
  eventCount: document.getElementById("event-count"),
  machineName: document.getElementById("machine-name"),
  pairCode: document.getElementById("pair-code"),
  projects: document.getElementById("projects"),
  projectCount: document.getElementById("project-count"),
  status: document.getElementById("status"),
  urls: document.getElementById("urls")
};

nodes.approve.addEventListener("click", () => post("/desktop/approve"));
nodes.deny.addEventListener("click", () => post("/desktop/deny"));

refresh();
setInterval(refresh, 900);

async function refresh() {
  try {
    const response = await fetch("/desktop/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Desktop state failed");
    currentState = { ...emptyState, ...(await response.json()) };
    render(currentState);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Could not load desktop state");
  }
}

async function post(path) {
  if (posting) return;
  posting = true;
  setPosting(true);
  try {
    const response = await fetch(path, { method: "POST" });
    if (!response.ok) throw new Error("Desktop action failed");
    currentState = { ...emptyState, ...(await response.json()) };
    render(currentState);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Desktop action failed");
  } finally {
    posting = false;
    setPosting(false);
  }
}

function render(state) {
  const pending = state.pendingPair && state.pendingPair.status === "pending";
  const denied = state.pendingPair && state.pendingPair.status === "denied";
  const paired = Boolean(state.pairedDevice);

  nodes.machineName.textContent = state.machineName || "Vibyra Desktop";
  nodes.pairCode.textContent = state.pairCode || "------";

  nodes.approval.hidden = !pending;
  if (pending) {
    nodes.approvalTitle.textContent = `${state.pendingPair.deviceName || "Vibyra Phone"} wants access`;
  }

  setStatus(
    pending ? "Approval needed" : denied ? "Request denied" : paired ? "Phone connected" : "Waiting",
    pending ? "warning" : denied ? "error" : paired ? "success" : "info"
  );

  renderEvents(state.events || []);
  renderProjects(state.projects || []);
  renderUrls(state.connectionUrls || []);
}

function renderEvents(events) {
  const latest = events.slice(0, 18);
  nodes.eventCount.textContent = `${latest.length} event${latest.length === 1 ? "" : "s"}`;
  replaceChildren(
    nodes.events,
    latest.length
      ? latest.map((event) => {
          const row = document.createElement("div");
          row.className = "event";

          const dot = document.createElement("span");
          dot.className = "event-dot";
          dot.style.backgroundColor = toneColor(event.tone);

          const copy = document.createElement("div");
          const message = document.createElement("p");
          message.className = "event-message";
          message.textContent = event.message || "Desktop event";
          const source = document.createElement("p");
          source.className = "event-source";
          source.textContent = event.source || "Desktop";

          copy.append(message, source);
          row.append(dot, copy);
          return row;
        })
      : [empty("Nothing yet.")]
  );
}

function renderProjects(projects) {
  nodes.projectCount.textContent = `${projects.length} found`;
  replaceChildren(
    nodes.projects,
    projects.length
      ? projects.slice(0, 10).map((project) => {
          const row = document.createElement("div");
          row.className = "project";

          const copy = document.createElement("div");
          const name = document.createElement("p");
          name.className = "project-name";
          name.textContent = project.name || "Project";
          const path = document.createElement("p");
          path.className = "project-path";
          path.textContent = project.path || "";
          copy.append(name, path);

          const stack = document.createElement("p");
          stack.className = "project-stack";
          stack.textContent = project.stack || "code";

          row.append(copy, stack);
          return row;
        })
      : [empty("Projects load after approval.")]
  );
}

function renderUrls(urls) {
  replaceChildren(
    nodes.urls,
    urls.length
      ? urls.map((url) => {
          const row = document.createElement("div");
          row.className = "url-row";
          const text = document.createElement("p");
          text.className = "url-text";
          text.textContent = url;
          row.append(text);
          return row;
        })
      : [empty("No local network address found yet.")]
  );
}

function renderError(message) {
  const item = document.createElement("div");
  item.className = "error";
  item.textContent = message;
  replaceChildren(nodes.events, [item]);
  setStatus("Desktop state unavailable", "error");
}

function setStatus(label, tone) {
  nodes.status.textContent = label;
  nodes.status.className = `status ${tone}`;
}

function setPosting(disabled) {
  nodes.approve.disabled = disabled;
  nodes.deny.disabled = disabled;
}

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}
