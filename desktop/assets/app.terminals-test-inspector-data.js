function normalizeTerminalTestInspectorElement(value) {
  if (!value || typeof value !== "object") return null;
  const source = value.source && typeof value.source === "object" ? value.source : {};
  const viewport = value.viewport && typeof value.viewport === "object" ? value.viewport : {};
  const rect = value.rect && typeof value.rect === "object" ? value.rect : {};
  return {
    tag: inspectorText(value.tag, 40),
    id: inspectorText(value.id, 120),
    text: inspectorText(value.text, 500),
    ariaLabel: inspectorText(value.ariaLabel, 240),
    classes: inspectorStringList(value.classes, 8, 100),
    path: inspectorStringList(value.path, 6, 160),
    page: inspectorText(value.page, 500),
    source: {
      framework: inspectorText(source.framework, 30),
      component: inspectorText(source.component, 120),
      file: inspectorText(source.file, 1000),
      line: inspectorNumber(source.line, 0, 0, 1_000_000),
      column: inspectorNumber(source.column, 0, 0, 100_000)
    },
    rect: {
      x: inspectorNumber(rect.x, 0, -3840, 3840),
      y: inspectorNumber(rect.y, 0, -2160, 2160),
      width: inspectorNumber(rect.width, 1, 1, 3840),
      height: inspectorNumber(rect.height, 1, 1, 2160)
    },
    viewport: {
      width: inspectorNumber(viewport.width, 390, 240, 3840),
      height: inspectorNumber(viewport.height, 844, 240, 2160)
    }
  };
}

function inspectorStringList(value, count, length) {
  return Array.isArray(value)
    ? value.slice(0, count).map((item) => inspectorText(item, length)).filter(Boolean)
    : [];
}

function inspectorText(value, length) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, length);
}

function inspectorNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
