export type PreviewRuntimeError = {
  column?: number;
  line?: number;
  message: string;
  source?: string;
  stack?: string;
  type: "console" | "error" | "resource" | "unhandledrejection" | "webview";
};

export function parsePreviewError(data: unknown): PreviewRuntimeError | null {
  if (!data || typeof data !== "object" || (data as { source?: unknown }).source !== "vibyra-preview-error") return null;
  const payload = data as Record<string, unknown>;
  const message = String(payload.message || "Preview runtime error");
  if (isIgnoredPreviewDiagnostic(message)) return null;
  return {
    column: numeric(payload.column),
    line: numeric(payload.line),
    message,
    source: payload.file ? String(payload.file) : undefined,
    stack: payload.stack ? String(payload.stack) : undefined,
    type: previewErrorType(payload.type)
  };
}

function isIgnoredPreviewDiagnostic(message: string) {
  return /You are using the in-browser Babel transformer/i.test(message);
}

function previewErrorType(value: unknown): PreviewRuntimeError["type"] {
  return value === "console" || value === "resource" || value === "unhandledrejection" ? value : "error";
}

function numeric(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}
