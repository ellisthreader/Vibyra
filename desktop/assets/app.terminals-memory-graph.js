function terminalMemoryGraphHtml() {
  terminalMemoryGraphSyncSize();
  const model = terminalMemoryGraphModel(terminalMemoryState.nodes);
  const transform = terminalMemoryGraphTransform();
  return `<section class="terminal-memory-graph" data-terminal-memory-graph>
    <div class="terminal-memory-graph-meta">
      <div><small>Project brain</small><strong>${model.documents} notes · ${model.edges.length} connections</strong></div>
      <div class="terminal-memory-graph-meta-actions">
        ${terminalMemoryGraphSummaryHtml(model)}
        <div class="terminal-memory-graph-controls" aria-label="Graph controls">
          <button type="button" data-terminal-memory-graph-zoom="out" aria-label="Zoom out">${icon("minus")}</button>
          <span data-terminal-memory-graph-scale>${Math.round(terminalMemoryState.graphScale * 100)}%</span>
          <button type="button" data-terminal-memory-graph-zoom="in" aria-label="Zoom in">${icon("plus")}</button>
          <button type="button" data-terminal-memory-graph-zoom="fit" aria-label="Reset graph view">Fit</button>
        </div>
      </div>
    </div>
    <div class="terminal-memory-graph-canvas" data-terminal-memory-graph-canvas>
      <svg viewBox="0 0 ${terminalMemoryGraphSize.width} ${terminalMemoryGraphSize.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Project memory graph">
          ${terminalMemoryGraphVisualsHtml(model)}
        <g data-terminal-memory-graph-scene transform="${transform}">
          <g class="terminal-memory-graph-edges">
            ${terminalMemoryGraphEdgesHtml(model)}
          </g>
          <g class="terminal-memory-graph-nodes">
            ${model.nodes.map((node) => terminalMemoryGraphNodeHtml(node, model)).join("")}
          </g>
        </g>
      </svg>
    </div>
  </section>`;
}

function terminalMemoryGraphNodeHtml(node, model) {
  const point = model.positions[node.id] || { x: 500, y: 360 };
  const selected = node.id === terminalMemoryState.selectedId;
  const degree = model.degrees[node.id] || 0;
  const radius = node.type === "folder" ? Math.min(11, 6.5 + degree * .38) : Math.min(8.5, 4 + degree * .3);
  const hub = node.type === "folder" || degree >= 5;
  const label = node.name.length > 28 ? `${node.name.slice(0, 27)}…` : node.name;
  const cluster = model.clusters[node.id] || 0;
  return `<g class="terminal-memory-graph-node cluster-${cluster} ${node.type} ${hub ? "hub" : ""} ${selected ? "selected" : ""}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})" data-terminal-memory-graph-node="${escapeAttribute(node.id)}" tabindex="0" role="button" aria-label="${escapeAttribute(node.name)}">
    ${terminalMemoryGraphNodeShapesHtml(node, radius, degree)}
    <text x="${(radius + 7).toFixed(1)}" y="4">${escapeHtml(label)}</text>
    <title>${escapeHtml(node.name)}</title>
  </g>`;
}

function terminalMemoryGraphEdgesHtml(model) {
  const pathFor = (edges) => edges.map((edge) => {
    const from = model.positions[edge.from];
    const to = model.positions[edge.to];
    return from && to ? terminalMemoryGraphEdgePath(edge, from, to) : "";
  }).join("");
  const tree = model.edges.filter((edge) => edge.kind === "tree");
  const links = model.edges.filter((edge) => edge.kind === "link");
  const selected = terminalMemoryState.selectedId
    ? model.edges.filter((edge) => edge.from === terminalMemoryState.selectedId || edge.to === terminalMemoryState.selectedId)
    : [];
  return `<path class="tree edge-batch" d="${pathFor(tree)}"></path>
    <path class="link edge-batch" d="${pathFor(links)}"></path>
    <path class="selected" d="${pathFor(selected)}"></path>
    <path class="focused" data-terminal-memory-graph-focus-edge d=""></path>`;
}

function bindTerminalMemoryGraphEvents(root) {
  const graph = root.matches?.("[data-terminal-memory-graph]")
    ? root
    : root.querySelector("[data-terminal-memory-graph]");
  if (!graph || graph.dataset.terminalMemoryGraphBound) return;
  graph.dataset.terminalMemoryGraphBound = "1";
  graph.addEventListener("click", (event) => {
    const node = event.target.closest("[data-terminal-memory-graph-node]");
    if (node) openTerminalMemoryGraphNode(node.dataset.terminalMemoryGraphNode);
    const control = event.target.closest("[data-terminal-memory-graph-zoom]");
    if (control) terminalMemoryGraphZoom(control.dataset.terminalMemoryGraphZoom);
  });
  graph.addEventListener("pointerover", (event) => {
    const node = event.target.closest("[data-terminal-memory-graph-node]");
    if (!node || node.contains(event.relatedTarget)) return;
    terminalMemoryGraphFocus(graph, node.dataset.terminalMemoryGraphNode);
  });
  graph.addEventListener("pointerout", (event) => {
    const node = event.target.closest("[data-terminal-memory-graph-node]");
    if (!node || node.contains(event.relatedTarget)) return;
    terminalMemoryGraphFocus(graph);
  });
  graph.addEventListener("keydown", (event) => {
    const node = event.target.closest("[data-terminal-memory-graph-node]");
    if (node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openTerminalMemoryGraphNode(node.dataset.terminalMemoryGraphNode);
    }
  });
  bindTerminalMemoryGraphViewport(graph.querySelector("[data-terminal-memory-graph-canvas]"));
}

function bindTerminalMemoryGraphViewport(canvas) {
  if (!canvas) return;
  bindTerminalMemoryGraphResize(canvas);
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

function bindTerminalMemoryGraphResize(canvas) {
  if (typeof ResizeObserver === "undefined" || canvas.dataset.terminalMemoryGraphResizeBound) return;
  canvas.dataset.terminalMemoryGraphResizeBound = "1";
  let previous = `${terminalMemoryGraphSize.width}:${terminalMemoryGraphSize.height}`;
  const observer = new ResizeObserver(() => {
    const measured = terminalMemoryGraphMeasureSize();
    const next = `${measured.width}:${measured.height}`;
    if (next === previous || Math.abs(measured.height - terminalMemoryGraphSize.height) < 80) return;
    previous = next;
    observer.disconnect();
    terminalMemoryGraphSize = measured;
    terminalMemoryState.graphPanX = 0;
    terminalMemoryState.graphPanY = 0;
    terminalMemoryRefresh();
  });
  observer.observe(canvas);
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
