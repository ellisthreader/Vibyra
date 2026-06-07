function terminalMemoryMarkdownHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let inCode = false;
  let code = [];
  let listType = "";
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = "";
  };

  lines.forEach((rawLine) => {
    const fence = rawLine.match(/^```([\w-]*)\s*$/);
    if (fence) {
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }
    if (inCode) {
      code.push(rawLine);
      return;
    }
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      return;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${terminalMemoryInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+)$/);
    if (task) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        output.push('<ul class="memory-task-list">');
      }
      output.push(`<li><input type="checkbox" disabled ${task[1].toLowerCase() === "x" ? "checked" : ""}>${terminalMemoryInlineMarkdown(task[2])}</li>`);
      return;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${nextType}>`);
      }
      output.push(`<li>${terminalMemoryInlineMarkdown((unordered || ordered)[1])}</li>`);
      return;
    }
    closeList();
    if (/^>\s?/.test(line)) {
      output.push(`<blockquote>${terminalMemoryInlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
    } else if (/^---+$/.test(line.trim())) {
      output.push("<hr>");
    } else {
      output.push(`<p>${terminalMemoryInlineMarkdown(line)}</p>`);
    }
  });
  if (inCode) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  closeList();
  return output.join("");
}

function terminalMemoryInlineMarkdown(value) {
  let safe = escapeHtml(value);
  const codeTokens = [];
  safe = safe.replace(/`([^`]+)`/g, (_, code) => {
    const token = `%%CODE${codeTokens.length}%%`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  safe = safe.replace(/\[\[([^\]]+)]]/g, (_, label) => `<span class="memory-wikilink">${label}</span>`);
  safe = safe.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = terminalMemorySafeUrl(url);
    return href ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  safe = safe.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  safe = safe.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  codeTokens.forEach((html, index) => {
    safe = safe.replace(`%%CODE${index}%%`, html);
  });
  return safe;
}

function terminalMemorySafeUrl(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("#")) return raw;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}
