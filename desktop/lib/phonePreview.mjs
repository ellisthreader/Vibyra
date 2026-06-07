import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const defaultPhonePreviewScript = "/home/ellis/Desktop/PhonePreview/start-phone-preview.sh";
const defaultPreviewUrl = "http://localhost:8081";

export async function startPhonePreview(body = {}, host = "") {
  const script = process.env.PHONE_PREVIEW_SCRIPT || defaultPhonePreviewScript;
  if (!existsSync(script)) {
    return { ok: false, error: `PhonePreview launcher was not found at ${script}.` };
  }
  const url = normalizePhonePreviewUrl(body.url, host);
  try {
    const child = spawn("bash", [script, url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return { ok: true, url, script };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PhonePreview could not start." };
  }
}

function normalizePhonePreviewUrl(value, host = "") {
  const raw = String(value || "").trim() || defaultPreviewUrl;
  try {
    const base = host ? `http://${host}` : defaultPreviewUrl;
    const parsed = new URL(raw, base);
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : defaultPreviewUrl;
  } catch {
    return defaultPreviewUrl;
  }
}
