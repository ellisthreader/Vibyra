import type { PreviewRuntimeError } from "../../../components/AppWebView";
import type { GeneratedApp } from "../../../types/domain";

export function buildFixPrompt(app: GeneratedApp, errors: PreviewRuntimeError[]) {
  return isProjectUrlPreview(app)
    ? buildProjectPreviewFixPrompt(app, errors)
    : buildGeneratedPreviewFixPrompt(app, errors);
}

function buildProjectPreviewFixPrompt(app: GeneratedApp, errors: PreviewRuntimeError[]) {
  return [
    `The live preview for "${app.title}" crashed while running the existing project. Fix the selected project files so the real app runs on phone preview.`,
    "Do not return a self-contained <vibyra-app>. Do not create an unrelated root index.html, static replacement page, or throwaway preview file. Keep the existing framework and product, inspect the relevant project files, and return normal code changes for this project.",
    "For Laravel/Inertia HTTP 419 errors, triage both sides before editing: the target project CSRF/session flow and the Vibyra Desktop preview proxy route `/preview/server/{project}/{token}/`. Check form/action URLs, POST body forwarding, session and XSRF cookies, X-CSRF/X-XSRF/Inertia headers, Origin/Referer behavior, middleware, redirects, and cookie path rewriting. Do not patch unrelated project code when the evidence points to preview proxy transport.",
    app.url ? `Preview URL: ${app.url}` : "",
    "",
    "Captured preview diagnostics:",
    formatDiagnostics(errors),
    "",
    "Keep the same app and fix the real cause in the existing project."
  ].filter(Boolean).join("\n");
}

function buildGeneratedPreviewFixPrompt(app: GeneratedApp, errors: PreviewRuntimeError[]) {
  const html = app.html?.trim();
  return [
    `The runnable preview for "${app.title}" crashed. Please fix the generated app so it runs on phone preview.`,
    "Return a corrected complete self-contained <vibyra-app> preview with inline <style> and inline <script>. Do not reference local files such as main.jsx, /src/main.jsx, App.jsx, style.css, or Vite/React entry files.",
    "",
    "Captured preview diagnostics:",
    formatDiagnostics(errors),
    html ? "\nCurrent generated preview HTML:\n```html\n".concat(html.slice(0, 12000), html.length > 12000 ? "\n<!-- truncated -->" : "", "\n```") : "",
    "",
    "Keep the same app idea and return the corrected complete runnable preview."
  ].filter(Boolean).join("\n");
}

function formatDiagnostics(errors: PreviewRuntimeError[]) {
  return errors.map((error, index) => {
    const location = formatLocation(error, ", ");
    const stack = sanitizeDiagnosticText(error.stack ?? "");
    return [
      `${index + 1}. ${error.type}: ${sanitizeDiagnosticText(error.message)}`,
      location ? `Location: ${location}` : "",
      stack ? `Stack:\n${stack}` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function isProjectUrlPreview(app: GeneratedApp) {
  return app.source === "desktop" || Boolean(app.url && !app.html?.trim());
}

function sanitizeDiagnosticText(value: string) {
  const raw = String(value || "");
  const withoutInjectedBlocks = raw
    .replace(/<main\b[^>]*\bid=["']vibyra-preview-http-error["'][\s\S]*?<\/main>/gi, " ")
    .replace(/<main\b[^>]*\bid=["']vibyra-preview-runtime-error["'][\s\S]*?<\/main>/gi, " ")
    .replace(/<main\b[^>]*\bid=["']vibyra-vite-module-error["'][\s\S]*?<\/main>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const title = withoutInjectedBlocks.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = withoutInjectedBlocks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  const detail = [title.replace(/\s+/g, " ").trim(), text].filter(Boolean).join("\n");
  return detail.slice(0, 1800);
}

function formatLocation(error: PreviewRuntimeError, separator: string) {
  return [error.source, error.line ? `line ${error.line}` : "", error.column ? `col ${error.column}` : ""].filter(Boolean).join(separator);
}
