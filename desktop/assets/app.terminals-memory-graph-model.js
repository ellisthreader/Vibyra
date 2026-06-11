let terminalMemoryGraphTopologyCache = null;
const terminalMemoryGraphLayoutCache = new WeakMap();

function terminalMemoryGraphModel(source) {
  const topology = terminalMemoryGraphTopology(source);
  const { width, height } = terminalMemoryGraphSize;
  const mode = terminalMemoryGraphIsFullscreen() ? "fullscreen" : "compact";
  const key = `${width}:${height}:${mode}`;
  const cachedLayouts = terminalMemoryGraphLayoutCache.get(topology);
  if (cachedLayouts?.has(key)) return cachedLayouts.get(key);
  const model = {
    ...topology,
    positions: terminalMemoryGraphPositions(topology.nodes, topology.edges)
  };
  const layouts = cachedLayouts || new Map();
  layouts.set(key, model);
  terminalMemoryGraphLayoutCache.set(topology, layouts);
  return model;
}

function terminalMemoryGraphTopology(source) {
  const revision = source === terminalMemoryState.nodes ? terminalMemoryState.graphRevision : -1;
  if (terminalMemoryGraphTopologyCache?.source === source
    && terminalMemoryGraphTopologyCache.revision === revision) {
    return terminalMemoryGraphTopologyCache.topology;
  }
  const nodes = Array.isArray(source) ? source.slice(0, 180) : [];
  const edges = terminalMemoryGraphEdges(nodes);
  const topology = {
    nodes,
    edges,
    documents: nodes.filter((node) => node.type === "document").length,
    degrees: terminalMemoryGraphDegrees(edges),
    clusters: terminalMemoryGraphClusters(nodes)
  };
  terminalMemoryGraphTopologyCache = { source, revision, topology };
  return topology;
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

function terminalMemoryGraphClusters(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const clusters = {};
  nodes.forEach((node) => {
    let current = node;
    while (current?.parentId && byId.has(current.parentId)) current = byId.get(current.parentId);
    clusters[node.id] = terminalMemoryGraphHash(current?.id || node.id) % 6;
  });
  return clusters;
}
