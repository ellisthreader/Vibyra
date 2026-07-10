const terminalEditorMonacoModels = new Map();
const terminalEditorMonacoViews = new Map();
let terminalEditorMonacoPromise = null;
let terminalEditorMonacoEditor = null;
let terminalEditorMonacoTabKey = "";
let terminalEditorMonacoDisposables = [];
let terminalEditorMonacoDecorations = null;
let terminalEditorThemeObserver = null;
let terminalEditorThemeMedia = null;
let terminalEditorThemeProbe = null;

function loadTerminalEditorMonaco() {
  if (window.monaco?.editor) return Promise.resolve(window.monaco);
  if (terminalEditorMonacoPromise) return terminalEditorMonacoPromise;
  terminalEditorMonacoPromise = new Promise((resolve, reject) => {
    if (typeof window.require !== "function") {
      reject(new Error("The code editor runtime is unavailable."));
      return;
    }
    window.require.config({ paths: { vs: "/desktop/vendor/monaco/vs" } });
    window.require(["vs/editor/editor.main"], () => {
      defineTerminalEditorTheme(window.monaco);
      resolve(window.monaco);
    }, reject);
  });
  return terminalEditorMonacoPromise;
}

function defineTerminalEditorTheme(monaco) {
  refreshTerminalEditorThemeDefinitions(monaco);
  ensureTerminalEditorThemeObserver(monaco);
}

function refreshTerminalEditorThemeDefinitions(monaco) {
  const colors = terminalEditorThemeColors();
  monaco.editor.defineTheme("vibyra-dark-plus", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors
  });
  monaco.editor.defineTheme("vibyra-light-plus", {
    base: "vs",
    inherit: true,
    rules: [],
    colors
  });
}

function terminalEditorThemeColors() {
  const background = terminalEditorCssColor("--terminal-bg", "#1e1e1e");
  const surface = terminalEditorCssColor("--terminal-surface", background);
  const elevated = terminalEditorCssColor("--terminal-elevated", surface);
  const text = terminalEditorCssColor("--terminal-text", "#d4d4d4");
  const copy = terminalEditorCssColor("--terminal-copy", text);
  const muted = terminalEditorCssColor("--terminal-muted", "#858585");
  const dim = terminalEditorCssColor("--terminal-dim", muted);
  const border = terminalEditorCssColor("--terminal-border", "#404040");
  const borderStrong = terminalEditorCssColor("--terminal-border-strong", border);
  const accent = terminalEditorCssColor("--terminal-accent", "#8b5cff");
  const hover = terminalEditorCssColor("--terminal-hover", terminalEditorAlpha(text, 0.08));
  return {
    "editor.background": background,
    "editor.foreground": copy,
    "editorCursor.foreground": accent,
    "editor.lineHighlightBackground": hover,
    "editorLineNumber.foreground": dim,
    "editorLineNumber.activeForeground": text,
    "editor.selectionBackground": terminalEditorCssColor("--terminal-selection", terminalEditorAlpha(accent, 0.22)),
    "editor.inactiveSelectionBackground": terminalEditorCssColor("--terminal-selection-inactive", terminalEditorAlpha(accent, 0.14)),
    "editorIndentGuide.background1": border,
    "editorIndentGuide.activeBackground1": borderStrong,
    "editorWhitespace.foreground": terminalEditorAlpha(muted, 0.38),
    "editorOverviewRuler.border": "#00000000",
    "editorWidget.background": elevated,
    "editorWidget.border": borderStrong,
    "editorSuggestWidget.background": elevated,
    "editorSuggestWidget.border": borderStrong,
    "editorSuggestWidget.foreground": copy,
    "editorSuggestWidget.selectedBackground": hover,
    "minimap.background": background,
    "scrollbarSlider.background": terminalEditorAlpha(muted, 0.32),
    "scrollbarSlider.hoverBackground": terminalEditorAlpha(muted, 0.48),
    "scrollbarSlider.activeBackground": terminalEditorAlpha(muted, 0.62)
  };
}

function terminalEditorCssColor(name, fallback) {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.getComputedStyle !== "function"
  ) {
    return fallback;
  }
  const root = document.body || document.documentElement;
  if (!root) return fallback;
  if (!terminalEditorThemeProbe) {
    terminalEditorThemeProbe = document.createElement("span");
    terminalEditorThemeProbe.setAttribute("aria-hidden", "true");
    terminalEditorThemeProbe.style.cssText = [
      "position:absolute",
      "left:-9999px",
      "top:-9999px",
      "visibility:hidden",
      "pointer-events:none"
    ].join(";");
  }
  if (!terminalEditorThemeProbe.isConnected) root.appendChild(terminalEditorThemeProbe);
  terminalEditorThemeProbe.style.color = `var(${name})`;
  const value = window.getComputedStyle(terminalEditorThemeProbe).color;
  return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
}

function terminalEditorAlpha(color, alpha) {
  const parts = String(color).match(/[\d.]+/g);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function terminalEditorEffectiveTheme() {
  const requested = document.body?.dataset.desktopTheme || "dark";
  if (requested === "auto") return window.matchMedia?.("(prefers-color-scheme: light)")?.matches
    ? "vibyra-light-plus"
    : "vibyra-dark-plus";
  return requested === "light" ? "vibyra-light-plus" : "vibyra-dark-plus";
}

function applyTerminalEditorTheme(monaco = window.monaco) {
  if (!monaco?.editor) return;
  refreshTerminalEditorThemeDefinitions(monaco);
  monaco.editor.setTheme(terminalEditorEffectiveTheme());
}

function ensureTerminalEditorThemeObserver(monaco) {
  const apply = () => applyTerminalEditorTheme(monaco);
  if (!terminalEditorThemeObserver && document.body && typeof MutationObserver === "function") {
    terminalEditorThemeObserver = new MutationObserver(apply);
    terminalEditorThemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-desktop-theme"]
    });
  }
  if (!terminalEditorThemeMedia && typeof window.matchMedia === "function") {
    terminalEditorThemeMedia = window.matchMedia("(prefers-color-scheme: light)");
    terminalEditorThemeMedia.addEventListener?.("change", apply);
  }
  apply();
}

async function mountTerminalEditorMonaco(host, tab) {
  if (!host || !tab) return;
  host.dataset.editorLoading = "true";
  try {
    const monaco = await loadTerminalEditorMonaco();
    if (!host.isConnected || activeTerminalEditorTab()?.key !== tab.key) return;
    terminalEditorPrepareRemount();
    const model = terminalEditorMonacoModel(monaco, tab);
    host.replaceChildren();
    terminalEditorMonacoEditor = monaco.editor.create(host, {
      model,
      theme: terminalEditorEffectiveTheme(),
      automaticLayout: true,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: true,
      minimap: { enabled: true, maxColumn: 90, renderCharacters: false, scale: 1 },
      lineNumbersMinChars: 4,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: "mouseover",
      glyphMargin: false,
      guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      renderLineHighlight: "all",
      renderWhitespace: "selection",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      scrollBeyondLastLine: true,
      padding: { top: 8, bottom: 28 },
      wordWrap: "off",
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: true,
      stickyScroll: { enabled: true },
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      contextmenu: true,
      links: true
    });
    terminalEditorMonacoTabKey = tab.key;
    terminalEditorMonacoDecorations = terminalEditorMonacoEditor.createDecorationsCollection();
    terminalEditorMonacoDisposables = [
      terminalEditorMonacoEditor.onDidChangeModelContent(() => {
        tab.content = model.getValue();
        updateTerminalEditorMonacoDecorations(monaco, tab);
        refreshTerminalEditorChrome();
      }),
      terminalEditorMonacoEditor.onDidChangeCursorPosition(({ position }) => {
        tab.line = position.lineNumber;
        tab.column = position.column;
        refreshTerminalEditorPosition(tab);
      })
    ];
    terminalEditorMonacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => void saveTerminalEditorTab(tab)
    );
    const savedView = terminalEditorMonacoViews.get(tab.key);
    if (savedView) terminalEditorMonacoEditor.restoreViewState(savedView);
    terminalEditorFocusMonacoLocation(tab, true);
    updateTerminalEditorMonacoDecorations(monaco, tab);
    refreshTerminalEditorChrome();
  } catch (error) {
    host.innerHTML = `<div class="terminal-editor-monaco-error">${escapeHtml(error instanceof Error ? error.message : "The code editor could not load.")}</div>`;
  } finally {
    delete host.dataset.editorLoading;
  }
}

function terminalEditorMonacoModel(monaco, tab) {
  let model = terminalEditorMonacoModels.get(tab.key);
  if (model && !model.isDisposed()) {
    if (model.getValue() !== String(tab.content || "")) model.setValue(String(tab.content || ""));
    monaco.editor.setModelLanguage(model, terminalEditorMonacoLanguage(tab));
    return model;
  }
  const uri = monaco.Uri.from({
    scheme: "vibyra",
    authority: encodeURIComponent(tab.terminalId),
    path: `/${tab.path}`
  });
  model = monaco.editor.createModel(String(tab.content || ""), terminalEditorMonacoLanguage(tab), uri);
  terminalEditorMonacoModels.set(tab.key, model);
  return model;
}

function terminalEditorMonacoLanguage(tab) {
  const language = String(tab?.language || "").toLowerCase();
  return ({
    cjs: "javascript", js: "javascript", jsx: "javascript", mjs: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", rs: "rust",
    sh: "shell", yml: "yaml", md: "markdown", kt: "kotlin", kts: "kotlin",
    env: "ini", text: "plaintext", txt: "plaintext"
  })[language] || language || "plaintext";
}

function updateTerminalEditorMonacoDecorations(monaco, tab) {
  if (!terminalEditorMonacoDecorations || tab.key !== terminalEditorMonacoTabKey) return;
  terminalEditorMonacoDecorations.set([...terminalEditorChangedLines(tab)].map((line) => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: "terminal-editor-line-changed",
      overviewRuler: {
        color: terminalEditorCssColor("--terminal-accent", "#8b5cff"),
        position: monaco.editor.OverviewRulerLane.Left
      }
    }
  })));
}

function terminalEditorPrepareRemount() {
  if (!terminalEditorMonacoEditor) return;
  const tab = terminalEditorTabs.find((item) => item.key === terminalEditorMonacoTabKey);
  if (tab) {
    const position = terminalEditorMonacoEditor.getPosition();
    tab.line = position?.lineNumber || tab.line;
    tab.column = position?.column || tab.column;
    terminalEditorMonacoViews.set(tab.key, terminalEditorMonacoEditor.saveViewState());
  }
  terminalEditorMonacoDisposables.forEach((item) => item.dispose());
  terminalEditorMonacoDisposables = [];
  terminalEditorMonacoDecorations?.clear();
  terminalEditorMonacoDecorations = null;
  terminalEditorMonacoEditor.dispose();
  terminalEditorMonacoEditor = null;
  terminalEditorMonacoTabKey = "";
}

function terminalEditorFocusMonacoLocation(tab, focus = true) {
  if (!terminalEditorMonacoEditor || terminalEditorMonacoTabKey !== tab?.key) return false;
  const position = { lineNumber: Math.max(1, tab.line || 1), column: Math.max(1, tab.column || 1) };
  terminalEditorMonacoEditor.setPosition(position);
  terminalEditorMonacoEditor.revealPositionInCenterIfOutsideViewport(position);
  if (focus) terminalEditorMonacoEditor.focus();
  return true;
}

function terminalEditorDisposeModel(key) {
  if (terminalEditorMonacoTabKey === key) terminalEditorPrepareRemount();
  terminalEditorMonacoModels.get(key)?.dispose();
  terminalEditorMonacoModels.delete(key);
  terminalEditorMonacoViews.delete(key);
}
