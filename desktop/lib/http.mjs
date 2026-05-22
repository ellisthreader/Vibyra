import { extname } from "node:path";
import { readFile } from "node:fs/promises";

export function headers(contentType = "application/json") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": contentType
  };
}

export function send(res, status, payload) {
  res.writeHead(status, headers());
  res.end(JSON.stringify(payload));
}

export async function sendFile(res, filePath) {
  const typeByExt = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp"
  };
  const content = await readFile(filePath);
  res.writeHead(200, headers(typeByExt[extname(filePath)] ?? "text/plain; charset=utf-8"));
  res.end(content);
}

export function readBody(req) {
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
