const terminalMemoryGraphSize = { width: 1000, height: 720 };

function terminalMemoryGraphPositions(nodes, edges) {
  const { width, height } = terminalMemoryGraphSize;
  const positions = {};
  const velocity = {};
  const center = { x: width / 2, y: height / 2 };
  nodes.forEach((node, index) => {
    const angle = index * 2.39996 + terminalMemoryGraphAngle(node.id) * .12;
    const radius = 95 + Math.sqrt(index + 1) * 38;
    positions[node.id] = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius * .72
    };
    velocity[node.id] = { x: 0, y: 0 };
  });
  const linked = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    linked.get(edge.from)?.push(edge);
    linked.get(edge.to)?.push(edge);
  });
  for (let step = 0; step < 150; step += 1) {
    terminalMemoryGraphRepel(nodes, positions, velocity);
    terminalMemoryGraphSpring(edges, positions, velocity);
    nodes.forEach((node) => {
      const point = positions[node.id];
      const speed = velocity[node.id];
      const gravity = linked.get(node.id)?.length ? .0012 : .00055;
      speed.x += (center.x - point.x) * gravity;
      speed.y += (center.y - point.y) * gravity;
      speed.x *= .82;
      speed.y *= .82;
      point.x = Math.max(35, Math.min(width - 35, point.x + speed.x));
      point.y = Math.max(35, Math.min(height - 35, point.y + speed.y));
    });
  }
  terminalMemoryGraphNormalizePositions(positions, width, height);
  return positions;
}

function terminalMemoryGraphNormalizePositions(positions, width, height) {
  const points = Object.values(positions);
  if (points.length < 2) return;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const sourceWidth = Math.max(1, maxX - minX);
  const sourceHeight = Math.max(1, maxY - minY);
  const paddingX = 70;
  const paddingY = 60;
  points.forEach((point) => {
    point.x = paddingX + (point.x - minX) / sourceWidth * (width - paddingX * 2);
    point.y = paddingY + (point.y - minY) / sourceHeight * (height - paddingY * 2);
  });
}

function terminalMemoryGraphRepel(nodes, positions, velocity) {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex];
      const a = positions[left.id];
      const b = positions[right.id];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1) {
        dx = Math.cos(terminalMemoryGraphAngle(`${left.id}:${right.id}`));
        dy = Math.sin(terminalMemoryGraphAngle(`${right.id}:${left.id}`));
        distanceSquared = 1;
      }
      if (distanceSquared > 22500) continue;
      const force = Math.min(3.2, 2300 / distanceSquared);
      const distance = Math.sqrt(distanceSquared);
      const fx = dx / distance * force;
      const fy = dy / distance * force;
      velocity[left.id].x += fx;
      velocity[left.id].y += fy;
      velocity[right.id].x -= fx;
      velocity[right.id].y -= fy;
    }
  }
}

function terminalMemoryGraphSpring(edges, positions, velocity) {
  edges.forEach((edge) => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const target = edge.kind === "tree" ? 100 : 145;
    const force = (distance - target) * (edge.kind === "tree" ? .005 : .003);
    const fx = dx / distance * force;
    const fy = dy / distance * force;
    velocity[edge.from].x += fx;
    velocity[edge.from].y += fy;
    velocity[edge.to].x -= fx;
    velocity[edge.to].y -= fy;
  });
}

function terminalMemoryGraphAngle(value) {
  return (terminalMemoryGraphHash(value) % 6283) / 1000;
}

function terminalMemoryGraphHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
