const terminalEditorMonacoModels = new Map();
const terminalEditorMonacoViews = new Map();
let terminalEditorMonacoPromise = null;
let terminalEditorMonacoEditor = null;
let terminalEditorMonacoTabKey = "";
let terminalEditorMonacoDisposables = [];
let terminalEditorMonacoDecorations = null;
let terminalEditorThemeObserver = null;
let terminalEditorThemeMedia = null;

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
  monaco.editor.defineTheme("vibyra-dark-plus", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1e1e1e",
      "editor.foreground": "#d4d4d4",
      "editorCursor.foreground": "#aeafad",
      "editor.lineHighlightBackground": "#2a2d2e",
      "editorLineNumber.foreground": "#858585",
      "editorLineNumber.activeForeground": "#c6c6c6",
      "editor.selectionBackground": "#264f78",
      "editor.inactiveSelectionBackground": "#3a3d41",
      "editorIndentGuide.background1": "#404040",
      "editorIndentGuide.activeBackground1": "#707070",
      "editorWhitespace.foreground": "#3b3a32",
      "editorOverviewRuler.border": "#00000000",
      "minimap.background": "#1e1e1e",
      "scrollbarSlider.background": "#79797966",
      "scrollbarSlider.hoverBackground": "#646464b3",
      "scrollbarSlider.activeBackground": "#bfbfbf66"
    }
  });
  monaco.editor.defineTheme("vibyra-light-plus", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#303646",
      "editorCursor.foreground": "#171923",
      "editor.lineHighlightBackground": "#f3f5f9",
      "editorLineNumber.foreground": "#8a90a0",
      "editorLineNumber.activeForeground": "#303646",
      "editor.selectionBackground": "#d8ccff",
      "editor.inactiveSelectionBackground": "#ebe6fb",
      "editorIndentGuide.background1": "#e3e6ee",
      "editorIndentGuide.activeBackground1": "#b9bfcc",
      "editorWhitespace.foreground": "#d1d5df",
      "editorOverviewRuler.border": "#00000000",
      "minimap.background": "#ffffff",
      "scrollbarSlider.background": "#68718333",
      "scrollbarSlider.hoverBackground": "#68718355",
      "scrollbarSlider.activeBackground": "#68718377"
    }
  });
  ensureTerminalEditorThemeObserver(monaco);
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
      overviewRuler: { color: "#8b5cff", position: monaco.editor.OverviewRulerLane.Left }
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
