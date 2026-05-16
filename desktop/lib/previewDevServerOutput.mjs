export function portsFromOutput(output) {
  const ports = [];
  const text = cleanDevServerOutput(output);
  for (const match of text.matchAll(/https?:\/\/[^\s:]+:(\d{2,5})/gi)) ports.push(Number(match[1]));
  for (const match of text.matchAll(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|[a-z0-9.-]+):(\d{2,5})\b/gi)) ports.push(Number(match[1]));
  return uniqueValues(ports).filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
}

export function publicDevServerBases(port, requestHost, output, fallbackBase) {
  return uniqueValues([
    fallbackBase,
    ...urlsFromOutput(output).filter((url) => samePort(url, port)),
  ]);
}

export function isViteOutputUrl(url, output) {
  return urlsFromOutput(output).includes(url);
}

function urlsFromOutput(output) {
  const urls = [];
  for (const match of cleanDevServerOutput(output).matchAll(/https?:\/\/[^\s)]+/gi)) {
    urls.push(normalizeUrl(match[0]));
  }
  return urls;
}

function cleanDevServerOutput(output) {
  return String(output ?? "")
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\[(?:\d{1,3})(?:;\d{1,3})*m/g, "")
    .replace(/(https?:\/\/)\s+/gi, "$1")
    .replace(/:\s+(\d{2,5})/g, ":$1")
    .replace(/(\d{2,5})\s+\//g, "$1/")
    .replace(/\s+([/?#])/g, "$1");
}

function normalizeUrl(url) {
  return url.replace(/[.,;]+$/g, "").replace(/\/+$/g, "");
}

function samePort(url, port) {
  try {
    return Number(new URL(url).port) === port;
  } catch {
    return false;
  }
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
