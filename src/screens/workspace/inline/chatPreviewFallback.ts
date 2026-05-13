import type { GeneratedApp } from "../../../types/domain";

type CodeBlock = {
  code: string;
  filename: string;
  language: string;
};

export function previewAppFromMessage(messageId: string, text: string): GeneratedApp | null {
  if (text.includes("▍")) return null;
  const blocks = parseCodeBlocks(text);
  if (blocks.length === 0) return null;

  const html = findBlock(blocks, ["html", "htm"], ["index.html"]);
  if (html?.code.trim()) {
    return {
      id: `${messageId}-preview-fallback`,
      title: previewTitle(html.filename),
      html: ensureHtmlDocument(html.code)
    };
  }

  const appCode = findReactAppBlock(blocks);
  if (!appCode) return null;
  const css = findBlock(blocks, ["css"], ["app.css", "style.css", "styles.css"]);

  return {
    id: `${messageId}-preview-fallback`,
    title: previewTitle(appCode.filename),
    html: reactPreviewHtml(appCode.code, css?.code ?? "")
  };
}

function parseCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const info = parseFenceInfo(match[1] ?? "");
    blocks.push({ ...info, code: (match[2] ?? "").replace(/\n$/, "") });
  }
  return blocks;
}

function parseFenceInfo(info: string): Pick<CodeBlock, "filename" | "language"> {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  let language = "";
  let filename = "";
  for (const token of tokens) {
    if (!filename && /\.[a-z0-9]+$/i.test(token)) filename = token;
    else if (!language) language = token;
  }
  if (!language && filename) language = filename.split(".").pop() ?? "";
  return { filename, language: language.toLowerCase() };
}

function findBlock(blocks: CodeBlock[], languages: string[], filenames: string[]) {
  return blocks.find((block) => {
    const filename = block.filename.toLowerCase().split("/").pop() ?? "";
    return languages.includes(block.language) || filenames.includes(filename);
  });
}

function findReactAppBlock(blocks: CodeBlock[]) {
  return blocks.find((block) => {
    const filename = block.filename.toLowerCase().split("/").pop() ?? "";
    const language = block.language.toLowerCase();
    const looksLikeAppFile = /^(app|main|index)\.(jsx?|tsx?)$/.test(filename);
    const looksLikeJsx = ["jsx", "tsx"].includes(language);
    return (looksLikeAppFile || looksLikeJsx) && /<[A-Za-z][\s\S]*>/.test(block.code);
  });
}

function previewTitle(filename: string) {
  if (!filename) return "Generated preview";
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  return base.replace(/\.[a-z0-9]+$/i, "") || "Generated preview";
}

function ensureHtmlDocument(html: string) {
  const trimmed = html.trim();
  if (/<!doctype html|<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${trimmed}</body></html>`;
}

function reactPreviewHtml(code: string, css: string) {
  const script = normalizeReactAppCode(code);
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${escapeStyle(css)}</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel" data-presets="env,react,typescript">
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const rnStyle = (style) => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(rnStyle)) : (style || {});
    const rnProps = ({ style, children, onPress, source, resizeMode, numberOfLines, ...props }) => props;
    const View = ({ style, children, ...props }) => <div style={rnStyle(style)} {...rnProps(props)}>{children}</div>;
    const Text = ({ style, children, ...props }) => <span style={rnStyle(style)} {...rnProps(props)}>{children}</span>;
    const SafeAreaView = View;
    const Pressable = ({ style, children, onPress, ...props }) => {
      const resolvedStyle = typeof style === "function" ? style({ pressed: false, hovered: false, focused: false }) : style;
      return <button type="button" onClick={onPress} style={Object.assign({ background: "transparent", border: 0, color: "inherit", cursor: "pointer", font: "inherit", padding: 0 }, rnStyle(resolvedStyle))} {...rnProps(props)}>{children}</button>;
    };
    const TouchableOpacity = Pressable;
    const TouchableHighlight = Pressable;
    const Button = ({ title, onPress, ...props }) => <button type="button" onClick={onPress} {...rnProps(props)}>{title}</button>;
    const TextInput = ({ style, value, onChangeText, ...props }) => <input value={value || ""} onChange={(event) => onChangeText?.(event.target.value)} style={rnStyle(style)} {...rnProps(props)} />;
    const ScrollView = ({ style, contentContainerStyle, children, ...props }) => <div style={Object.assign({ overflow: "auto" }, rnStyle(style), rnStyle(contentContainerStyle))} {...rnProps(props)}>{children}</div>;
    const FlatList = ({ data = [], renderItem, keyExtractor, ListEmptyComponent }) => data.length ? <div>{data.map((item, index) => <React.Fragment key={keyExtractor?.(item, index) || index}>{renderItem?.({ item, index })}</React.Fragment>)}</div> : (ListEmptyComponent ? <ListEmptyComponent /> : null);
    const ActivityIndicator = ({ style, ...props }) => <span style={rnStyle(style)} {...rnProps(props)}>Loading...</span>;
    const Image = ({ source, style, resizeMode, ...props }) => <img src={typeof source === "string" ? source : source?.uri || ""} style={Object.assign({ objectFit: resizeMode || "contain" }, rnStyle(style))} {...rnProps(props)} />;
    const LinearGradient = ({ colors = [], style, children, ...props }) => <div style={Object.assign({ background: colors.length ? "linear-gradient(135deg, " + colors.join(", ") + ")" : undefined }, rnStyle(style))} {...rnProps(props)}>{children}</div>;
    const WebView = ({ source, style, ...props }) => <iframe src={source?.uri} srcDoc={source?.html} sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals" style={Object.assign({ border: 0, minHeight: 320, width: "100%" }, rnStyle(style))} title="Generated app preview" {...rnProps(props)} />;
    const StyleSheet = { create: (styles) => styles, flatten: rnStyle, absoluteFillObject: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } };
    const Platform = { OS: "web", select: (values) => values?.web ?? values?.default };
    const Dimensions = { get: () => ({ width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio || 1 }) };
    const Easing = { linear: (value) => value, inOut: () => (value) => value, out: () => (value) => value, in: () => (value) => value, quad: (value) => value, cubic: (value) => value };
    const Animated = { View, Text, Image, ScrollView, timing: () => ({ start: (done) => done?.({ finished: true }) }), loop: (animation) => animation, sequence: (items) => ({ start: () => items.forEach((item) => item?.start?.()) }), parallel: (items) => ({ start: () => items.forEach((item) => item?.start?.()) }), Value: function (value) { this.value = value; this.setValue = (next) => { this.value = next; }; this.interpolate = () => this.value; } };
    const BrowserRouter = ({ children }) => <>{children}</>;
    const HashRouter = BrowserRouter;
    const MemoryRouter = BrowserRouter;
    const Routes = ({ children }) => <>{children}</>;
    const Route = ({ element, children }) => element || children || null;
    const Link = ({ to, href, children, ...props }) => <a href={href || to || "#"} {...props}>{children}</a>;
    const NavLink = Link;
    const Navigate = () => null;
    const Outlet = () => null;
    const useNavigate = () => function () {};
    const useLocation = () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash });
    const useParams = () => ({});
    ${escapeScript(script)}
    if (!document.getElementById("root").hasChildNodes() && typeof App !== "undefined") {
      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    }
  </script>
</body>
</html>`;
}

function normalizeReactAppCode(code: string) {
  let output = stripModuleSyntax(code);
  const defaultFunction = /^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/m.exec(output)?.[1] ?? "";
  const defaultIdentifier = /^\s*export\s+default\s+([A-Za-z_$][\w$]*);?\s*$/m.exec(output)?.[1] ?? "";
  output = output
    .replace(/^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/gm, "function $1")
    .replace(/^\s*export\s+default\s+function\s*\(/gm, "function App(")
    .replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "const App = ");
  const appName = defaultFunction || defaultIdentifier;
  if (appName && appName !== "App" && !/\b(const|function|class)\s+App\b/.test(output)) {
    output += `\nconst App = ${appName};`;
  }
  return output;
}

function stripModuleSyntax(code: string) {
  return code
    .replace(/^\s*import\s+type\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*(?:const|let|var)\s+[^=\n]+=\s*require\(["'][^"']+["']\);?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
    .replace(/^\s*export\s+(?=(?:const|let|var|function|class)\s+)/gm, "");
}

function escapeScript(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(value: string) {
  return value.replace(/<\/style/gi, "<\\/style");
}
