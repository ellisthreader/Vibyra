export const PREVIEW_INSPECTOR_RUNTIME_SCRIPT = String.raw`
  if (window.parent !== window && !window.__vibyraPreviewInspector) {
    window.__vibyraPreviewInspector = true;
    var inspectorHighlight = null;
    function inspectorSend(element) {
      try {
        window.parent.postMessage({
          source: "vibyra-preview-inspector",
          type: "element-selected",
          element: element
        }, "*");
      } catch (_) {}
    }
    function inspectorSource(target) {
      var keys = [];
      try { keys = Object.keys(target); } catch (_) {}
      var fiberKey = keys.find(function (key) {
        return key.indexOf("__reactFiber$") === 0 || key.indexOf("__reactInternalInstance$") === 0;
      });
      var fiber = fiberKey ? target[fiberKey] : null;
      for (var depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
        var owner = fiber._debugOwner;
        var source = fiber._debugSource || owner && owner._debugSource;
        var name = fiber.elementType && (fiber.elementType.displayName || fiber.elementType.name)
          || fiber.type && (fiber.type.displayName || fiber.type.name)
          || owner && owner.type && (owner.type.displayName || owner.type.name);
        if (source || name) {
          return {
            framework: "react",
            component: String(name || ""),
            file: String(source && source.fileName || ""),
            line: Number(source && source.lineNumber) || 0,
            column: Number(source && source.columnNumber) || 0
          };
        }
      }
      var vue = target.__vueParentComponent;
      if (vue) {
        return {
          framework: "vue",
          component: String(vue.type && (vue.type.name || vue.type.__name) || ""),
          file: String(vue.type && vue.type.__file || ""),
          line: 0,
          column: 0
        };
      }
      return { framework: "", component: "", file: "", line: 0, column: 0 };
    }
    function inspectorText(target) {
      var value = target && target.innerText;
      return String(value || target && target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500);
    }
    function inspectorPath(target) {
      var path = [];
      for (var node = target; node && node.nodeType === 1 && path.length < 6; node = node.parentElement) {
        var part = String(node.tagName || "").toLowerCase();
        if (node.id) part += "#" + String(node.id).slice(0, 80);
        else if (node.classList && node.classList.length) part += "." + Array.from(node.classList).slice(0, 2).join(".");
        path.unshift(part);
      }
      return path;
    }
    function inspectorDescriptor(target) {
      var rect = target.getBoundingClientRect();
      var source = inspectorSource(target);
      return {
        tag: String(target.tagName || "").toLowerCase(),
        id: String(target.id || "").slice(0, 120),
        classes: target.classList ? Array.from(target.classList).slice(0, 8).map(String) : [],
        role: String(target.getAttribute && target.getAttribute("role") || "").slice(0, 80),
        ariaLabel: String(target.getAttribute && target.getAttribute("aria-label") || "").slice(0, 240),
        text: inspectorText(target),
        path: inspectorPath(target),
        source: source,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        page: String(location.pathname || "").slice(0, 500)
      };
    }
    function inspectorClear() {
      if (inspectorHighlight) inspectorHighlight.remove();
      inspectorHighlight = null;
    }
    function inspectorShow(rect) {
      inspectorClear();
      var box = document.createElement("div");
      box.id = "vibyra-preview-inspector-highlight";
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = [
        "position:fixed", "pointer-events:none", "z-index:2147483646",
        "box-sizing:border-box", "border:2px solid #8e3cff",
        "border-radius:4px", "background:rgba(142,60,255,.08)",
        "box-shadow:0 0 0 1px rgba(255,255,255,.55),0 8px 28px rgba(25,9,54,.25)",
        "left:" + Math.round(rect.x) + "px", "top:" + Math.round(rect.y) + "px",
        "width:" + Math.max(1, Math.round(rect.width)) + "px",
        "height:" + Math.max(1, Math.round(rect.height)) + "px"
      ].join(";");
      (document.body || document.documentElement).appendChild(box);
      inspectorHighlight = box;
    }
    document.addEventListener("contextmenu", function (event) {
      if (event.shiftKey) return;
      var path = event.composedPath && event.composedPath();
      var target = path && path[0] || event.target;
      if (!target || target.nodeType !== 1 || target.id === "vibyra-preview-inspector-highlight") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var descriptor = inspectorDescriptor(target);
      inspectorShow(descriptor.rect);
      inspectorSend(descriptor);
    }, true);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") inspectorClear();
    }, true);
    window.addEventListener("message", function (event) {
      if (event && event.data && event.data.source === "vibyra-preview-inspector-clear") inspectorClear();
    });
  }
`;
