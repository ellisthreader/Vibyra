import { Buffer } from "node:buffer";
import { proxyLimitError } from "./previewProxyLimits.mjs";

export function readRawRequestBody(req, maxBodyBytes) {
  const contentLength = Number.parseInt(String(req?.headers?.["content-length"] ?? ""), 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return Promise.reject(requestBodyTooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBodyBytes) {
        settled = true;
        reject(requestBodyTooLarge());
        req.destroy?.();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function requestBodyTooLarge() {
  return proxyLimitError(
    "Preview request body exceeds the configured limit",
    413,
    "PREVIEW_PROXY_REQUEST_TOO_LARGE"
  );
}
