const startupFeeds = new Map();

export function beginPreviewStartup(projectId, target) {
  const feed = {
    projectId,
    targetId: target.id,
    command: target.command,
    framework: target.framework,
    state: "starting",
    output: `$ ${target.command}\n`,
    updatedAt: new Date().toISOString()
  };
  startupFeeds.set(feedKey(projectId, target.id), feed);
  return feed;
}

export function appendPreviewStartup(projectId, targetId, chunk) {
  const feed = startupFeeds.get(feedKey(projectId, targetId));
  if (!feed || feed.state !== "starting") return;
  feed.output = `${feed.output}${String(chunk)}`.slice(-12000);
  feed.updatedAt = new Date().toISOString();
}

export function finishPreviewStartup(projectId, targetId, state, message = "") {
  const feed = startupFeeds.get(feedKey(projectId, targetId));
  if (!feed) return;
  feed.state = state;
  if (message) feed.output = `${feed.output}${feed.output.endsWith("\n") ? "" : "\n"}${message}\n`.slice(-12000);
  feed.updatedAt = new Date().toISOString();
}

export function previewStartupFeed(projectId, targetId) {
  const feed = startupFeeds.get(feedKey(projectId, targetId));
  return feed ? { ...feed } : null;
}

function feedKey(projectId, targetId) {
  return `${String(projectId || "")}\n${String(targetId || "")}`;
}
