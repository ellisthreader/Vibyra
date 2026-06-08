function terminalMemoryGraphHtml() {
  const model = terminalMemoryGraphModel(terminalMemoryState.nodes);
  const transform = terminalMemoryGraphTransform();
  return `<section class="terminal-memory-graph" data-terminal-memory-graph>
    <div class="terminal-memory-graph-meta">
      <div><small>Project brain</small><strong>${model.documents} notes · ${model.edges.length} connections</strong></div>
      <div class="terminal-memory-graph-controls" aria-label="Graph controls">
        <button type="button" data-terminal-memory-graph-zoom="out" aria-label="Zoom out">${icon("minus")}</button>
        <span data-terminal-memory-graph-scale>${Math.round(terminalMemoryState.graphScale * 100)}%</span>
        <button type="button" data-terminal-memory-graph-zoom="in" aria-label="Zoom in">${icon("plus")}</button>
        <button type="button" data-terminal-memory-graph-zoom="fit" aria-label="Reset graph view">Fit</button>
      </div>
    </div>
    <div class="terminal-memory-graph-canvas" data-terminal-memory-graph-canvas>
      <svg viewBox="0 0 ${terminalMemoryGraphSize.width} ${terminalMemoryGraphSize.height}" role="img" aria-label="Project memory graph">
        ${terminalMemoryGraphVisualsHtml(model)}
        <g data-terminal-memory-graph-scene transform="${transform}">
          <g class="terminal-memory-graph-edges">
            ${model.edges.map((edge) => terminalMemoryGraphEdgeHtml(edge, model.positions)).join("")}
          </g>
          <g class="terminal-memory-graph-nodes">
            ${model.nodes.map((node) => terminalMemoryGraphNodeHtml(node, model)).join("")}
          </g>
        </g>
      </svg>
    </div>
    <footer class="terminal-memory-graph-footer">
      <span class="terminal-memory-graph-hint">Scroll to zoom · drag to move</span>
      ${terminalMemoryGraphSummaryHtml(model)}
    </footer>
  </section>`;
}

function terminalMemoryGraphModel(source) {
  const nodes = Array.isArray(source) ? source.slice(0, 180) : [];
  const edges = terminalMemoryGraphEdges(nodes);
  return {
    nodes,
    edges,
    positions: terminalMemoryGraphPositions(nodes, edges),
    documents: nodes.filter((node) => node.type === "document").length,
    degrees: terminalMemoryGraphDegrees(edges)
  };
}

function terminalMemoryGraphEdges(nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  const names = new Map();
  nodes.forEach((node) => terminalMemoryGraphNames(node).forEach((name) => names.set(name, node.id)));
  const edges = [];
  nodes.forEach((node) => {
    if (node.parentId && ids.has(node.parentId)) edges.push({ from: node.parentId, to: node.id, kind: "tree" });
    if (node.type !== "document") return;
    terminalMemoryGraphLinks(node.body).forEach((name) => {
      const target = names.get(name);
      if (target && target !== node.id) edges.push({ from: node.id, to: target, kind: "link" });
    });
  });
  const seen = new Set();
  return edges.filter((edge) => {
    const key = [edge.from, edge.to].sort().join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function terminalMemoryGraphNodeHtml(node, model) {
  const point = model.positions[node.id] || { x: 500, y: 360 };
  const selected = node.id === terminalMemoryState.selectedId;
  const degree = model.degrees[node.id] || 0;
  const radius = node.type === "folder" ? Math.min(11, 6.5 + degree * .38) : Math.min(8.5, 4 + degree * .3);
  const hub = node.type === "folder" || degree >= 5;
  const label = node.name.length > 28 ? `${node.name.slice(0, 27)}…` : node.name;
  const cluster = terminalMemoryGraphCluster(node, model.nodes);
  return `<g class="terminal-memory-graph-node cluster-${cluster} ${node.type} ${hub ? "hub" : ""} ${selected ? "selected" : ""}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})" data-terminal-memory-graph-node="${escapeAttribute(node.id)}" tabindex="0" role="button" aria-label="${escapeAttribute(node.name)}">
    ${terminalMemoryGraphNodeShapesHtml(node, radius, degree)}
    <text x="${(radius + 7).toFixed(1)}" y="4">${escapeHtml(label)}</text>
    <title>${escapeHtml(node.name)}</title>
  </g>`;
}

function terminalMemoryGraphEdgeHtml(edge, positions) {
  const from = positions[edge.from];
  const to = positions[edge.to];
  if (!from || !to) return "";
  const selected = [edge.from, edge.to].includes(terminalMemoryState.selectedId);
  return `<path class="${edge.kind} ${selected ? "selected" : ""}" d="${terminalMemoryGraphEdgePath(edge, from, to)}" data-terminal-memory-graph-edge data-from="${escapeAttribute(edge.from)}" data-to="${escapeAttribute(edge.to)}"></path>`;
}

function bindTerminalMemoryGraphEvents(root) {
  root.querySelectorAll("[data-terminal-memory-graph-node]").forEach((node) => {
    const open = () => openTerminalMemoryGraphNode(node.dataset.terminalMemoryGraphNode);
    node.addEventListener("click", open);
    node.addEventListener("pointerenter", () => terminalMemoryGraphFocus(root, node.dataset.terminalMemoryGraphNode));
    node.addEventListener("pointerleave", () => terminalMemoryGraphFocus(root));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
  root.querySelectorAll("[data-terminal-memory-graph-zoom]").forEach((button) => {
    button.addEventListener("click", () => terminalMemoryGraphZoom(button.dataset.terminalMemoryGraphZoom));
  });
  bindTerminalMemoryGraphViewport(root.querySelector("[data-terminal-memory-graph-canvas]"));
}

function bindTerminalMemoryGraphViewport(canvas) {
  if (!canvas) return;
  let drag = null;
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    terminalMemoryGraphSetScale(terminalMemoryState.graphScale * (event.deltaY < 0 ? 1.12 : .89));
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-terminal-memory-graph-node]")) return;
    drag = { x: event.clientX, y: event.clientY, panX: terminalMemoryState.graphPanX, panY: terminalMemoryState.graphPanY };
    canvas.classList.add("dragging");
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const scaleX = terminalMemoryGraphSize.width / Math.max(canvas.clientWidth, 1);
    const scaleY = terminalMemoryGraphSize.height / Math.max(canvas.clientHeight, 1);
    terminalMemoryState.graphPanX = drag.panX + (event.clientX - drag.x) * scaleX;
    terminalMemoryState.graphPanY = drag.panY + (event.clientY - drag.y) * scaleY;
    terminalMemoryGraphApplyTransform(canvas.closest("[data-terminal-memory-graph]"));
  });
  const stop = () => {
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

function terminalMemoryGraphZoom(action) {
  if (action === "fit") {
    terminalMemoryState.graphScale = 1;
    terminalMemoryState.graphPanX = 0;
    terminalMemoryState.graphPanY = 0;
  } else {
    terminalMemoryGraphSetScale(terminalMemoryState.graphScale * (action === "in" ? 1.2 : .8), false);
  }
  terminalMemoryGraphApplyTransform(document.querySelector("[data-terminal-memory-graph]"));
}

function terminalMemoryGraphSetScale(value, apply = true) {
  terminalMemoryState.graphScale = Math.max(.55, Math.min(3.2, value));
  if (apply) terminalMemoryGraphApplyTransform(document.querySelector("[data-terminal-memory-graph]"));
}

function terminalMemoryGraphApplyTransform(graph) {
  graph?.querySelector("[data-terminal-memory-graph-scene]")?.setAttribute("transform", terminalMemoryGraphTransform());
  const label = graph?.querySelector("[data-terminal-memory-graph-scale]");
  if (label) label.textContent = `${Math.round(terminalMemoryState.graphScale * 100)}%`;
}

function terminalMemoryGraphTransform() {
  const { width, height } = terminalMemoryGraphSize;
  const scale = terminalMemoryState.graphScale;
  const centerX = width / 2;
  const centerY = height / 2;
  return `translate(${terminalMemoryState.graphPanX + centerX} ${terminalMemoryState.graphPanY + centerY}) scale(${scale}) translate(${-centerX} ${-centerY})`;
}

function openTerminalMemoryGraphNode(nodeId) {
  const node = terminalMemoryState.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  terminalMemorySelect(node.id);
  if (node.type === "document") terminalMemoryState.view = "notes";
  terminalMemoryRefresh();
}

function terminalMemoryGraphLinks(markdown) {
  const found = [];
  String(markdown || "").replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_, name) => found.push(terminalMemoryGraphKey(name)));
  String(markdown || "").replace(/\[[^\]]*\]\(([^)]+\.md)(?:#[^)]+)?\)/gi, (_, name) => found.push(terminalMemoryGraphKey(name)));
  return found.filter(Boolean);
}

function terminalMemoryGraphNames(node) {
  return [node.name, node.sourcePath].map(terminalMemoryGraphKey).filter(Boolean);
}

function terminalMemoryGraphKey(value) {
  return String(value || "").replace(/\\/g, "/").split("/").pop().replace(/\.md$/i, "").trim().toLowerCase();
}

function terminalMemoryGraphDegrees(edges) {
  const degrees = {};
  edges.forEach((edge) => {
    degrees[edge.from] = (degrees[edge.from] || 0) + 1;
    degrees[edge.to] = (degrees[edge.to] || 0) + 1;
  });
  return degrees;
}
