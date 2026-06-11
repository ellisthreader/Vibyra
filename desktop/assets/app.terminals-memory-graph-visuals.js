function terminalMemoryGraphVisualsHtml(model) {
  return `<defs>
    <pattern id="memory-grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M36 0H0V36" fill="none" stroke="currentColor" stroke-opacity=".055" stroke-width=".6"></path>
    </pattern>
  </defs>
  <rect class="terminal-memory-graph-grid" width="100%" height="100%" fill="url(#memory-grid)"></rect>
  <g class="terminal-memory-graph-regions">${terminalMemoryGraphRegionsHtml(model)}</g>`;
}

function terminalMemoryGraphRegionsHtml(model) {
  const children = new Map();
  model.nodes.forEach((node) => {
    if (!node.parentId) return;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  });
  return model.nodes.filter((node) => node.type === "folder").map((folder) => {
    const members = [folder, ...(children.get(folder.id) || [])];
    if (members.length < 2) return "";
    const points = members.map((node) => model.positions[node.id]).filter(Boolean);
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
    const radiusX = Math.max(48, Math.min(170, Math.max(...points.map((point) => Math.abs(point.x - center.x))) + 34));
    const radiusY = Math.max(40, Math.min(135, Math.max(...points.map((point) => Math.abs(point.y - center.y))) + 28));
    const cluster = model.clusters[folder.id] || 0;
    return `<ellipse class="cluster-${cluster}" cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" rx="${radiusX.toFixed(1)}" ry="${radiusY.toFixed(1)}"></ellipse>`;
  }).join("");
}

function terminalMemoryGraphSummaryHtml(model) {
  const folders = model.nodes.filter((node) => node.type === "folder").length;
  const linked = model.nodes.filter((node) => (model.degrees[node.id] || 0) > 0).length;
  return `<div class="terminal-memory-graph-legend" aria-label="Graph summary">
    <span><i class="folder"></i>${folders} folders</span>
    <span><i class="linked"></i>${linked} connected</span>
    <span><i class="link"></i>Markdown links</span>
  </div>`;
}

function terminalMemoryGraphNodeShapesHtml(node, radius, degree) {
  const ring = Math.max(radius + 4, radius * 1.55);
  return `${degree >= 4 || node.type === "folder" ? `<circle class="node-orbit" r="${ring.toFixed(1)}"></circle>` : ""}
    <circle class="node-core" r="${radius.toFixed(1)}"></circle>
    ${node.type === "folder" ? `<circle class="node-center" r="${Math.max(2.1, radius * .34).toFixed(1)}"></circle>` : ""}`;
}

function terminalMemoryGraphEdgePath(edge, from, to) {
  if (edge.kind === "tree") return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = Math.min(34, Math.sqrt(dx * dx + dy * dy) * .13);
  const sign = terminalMemoryGraphHash(`${edge.from}:${edge.to}`) % 2 ? 1 : -1;
  const middleX = (from.x + to.x) / 2 - dy / Math.max(1, Math.sqrt(dx * dx + dy * dy)) * bend * sign;
  const middleY = (from.y + to.y) / 2 + dx / Math.max(1, Math.sqrt(dx * dx + dy * dy)) * bend * sign;
  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${middleX.toFixed(1)} ${middleY.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function terminalMemoryGraphFocus(graph, nodeId = "") {
  const index = terminalMemoryGraphInteractionIndex(graph);
  index.activeNodes.forEach((node) => node.classList.remove("related"));
  index.activeNodes = [];
  graph.classList.toggle("focusing", Boolean(nodeId));
  if (!nodeId) {
    index.focusEdge.setAttribute("d", "");
    return;
  }
  const relatedIds = new Set([nodeId]);
  (index.edgesByNode.get(nodeId) || []).forEach((edge) => {
    relatedIds.add(edge.from);
    relatedIds.add(edge.to);
  });
  index.focusEdge.setAttribute("d", (index.edgesByNode.get(nodeId) || []).map((edge) => {
    const from = index.model.positions[edge.from];
    const to = index.model.positions[edge.to];
    return from && to ? terminalMemoryGraphEdgePath(edge, from, to) : "";
  }).join(""));
  relatedIds.forEach((id) => {
    const node = index.nodes.get(id);
    if (!node) return;
    node.classList.add("related");
    index.activeNodes.push(node);
  });
}

function terminalMemoryGraphInteractionIndex(graph) {
  if (graph.terminalMemoryGraphInteractionIndex) return graph.terminalMemoryGraphInteractionIndex;
  const nodes = new Map();
  const edgesByNode = new Map();
  const model = terminalMemoryGraphModel(terminalMemoryState.nodes);
  graph.querySelectorAll("[data-terminal-memory-graph-node]").forEach((node) => {
    nodes.set(node.dataset.terminalMemoryGraphNode, node);
  });
  model.edges.forEach((edge) => {
    [edge.from, edge.to].forEach((id) => {
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id).push(edge);
    });
  });
  graph.terminalMemoryGraphInteractionIndex = {
    nodes,
    edgesByNode,
    model,
    focusEdge: graph.querySelector("[data-terminal-memory-graph-focus-edge]"),
    activeNodes: []
  };
  return graph.terminalMemoryGraphInteractionIndex;
}
