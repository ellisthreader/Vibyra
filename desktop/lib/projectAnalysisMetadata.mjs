export function readPackageMetadata(text, rel, state) {
  try {
    const pkg = JSON.parse(text);
    state.packages.push(pkg);
    if (pkg.name) state.titles.push(cleanText(String(pkg.name).replace(/[-_]+/g, " ")));
    if (pkg.description) addDescription(state, String(pkg.description), rel);
  } catch {
    return;
  }
}

export function readTextMetadata(text, rel, name, ext, state) {
  if (name.toLowerCase().includes("readme") && ext === ".md") readMarkdown(text, rel, state);
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1];
  if (title) state.titles.push(cleanText(title));
  const htmlDescription = text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  if (htmlDescription) addDescription(state, htmlDescription, rel);
}

export function formatDescriptionSummary(title, description) {
  const sentence = description.endsWith(".") ? description : `${description}.`;
  if (!title) return sentence;
  if (sentence.toLowerCase().startsWith(title.toLowerCase())) return sentence;
  return `${title}: ${sentence}`;
}

export function cleanText(value, maxLength = 90) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function readMarkdown(text, rel, state) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let foundTitle = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    const heading = line.match(/^#\s+(.+)$/);
    if (heading && !foundTitle) {
      state.titles.push(cleanText(stripMarkdown(heading[1])));
      foundTitle = true;
      continue;
    }
    if (isMarkdownNoise(line)) continue;
    addDescription(state, firstSentence(stripMarkdown(line)), rel);
    return;
  }
}

function addDescription(state, value, rel) {
  const description = cleanText(value, 180);
  if (!description || state.descriptions.includes(description)) return;
  state.descriptions.push(description);
  if (rel && !state.descriptionEvidence.includes(rel)) state.descriptionEvidence.push(rel);
}

function firstSentence(value) {
  const match = value.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? value;
}

function stripMarkdown(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#]/g, "")
    .trim();
}

function isMarkdownNoise(line) {
  return /^#{1,6}\s/.test(line)
    || /^[-*+]\s/.test(line)
    || /^\d+\.\s/.test(line)
    || /^\|/.test(line)
    || /^<[^>]+>$/.test(line)
    || /badge|shields\.io/i.test(line);
}
