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
      var nearestComponent = "";
      var ownerSource = null;
      for (var depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
        var owner = fiber._debugOwner;
        var name = fiber.elementType && (fiber.elementType.displayName || fiber.elementType.name)
          || fiber.type && (fiber.type.displayName || fiber.type.name)
          || "";
        if (!nearestComponent && name) nearestComponent = String(name);
        if (!ownerSource && owner && owner._debugSource) {
          ownerSource = {
            component: String(owner.type && (owner.type.displayName || owner.type.name) || name || ""),
            source: owner._debugSource
          };
        }
        if (fiber._debugSource) {
          return {
            framework: "react",
            component: String(name || owner && owner.type && (owner.type.displayName || owner.type.name) || ""),
            file: String(fiber._debugSource.fileName || ""),
            line: Number(fiber._debugSource.lineNumber) || 0,
            column: Number(fiber._debugSource.columnNumber) || 0
          };
        }
      }
      if (ownerSource) {
        return {
          framework: "react",
          component: ownerSource.component,
          file: String(ownerSource.source.fileName || ""),
          line: Number(ownerSource.source.lineNumber) || 0,
          column: Number(ownerSource.source.columnNumber) || 0
        };
      }
      if (nearestComponent) {
        return { framework: "react", component: nearestComponent, file: "", line: 0, column: 0 };
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
        var testId = node.getAttribute && (node.getAttribute("data-testid") || node.getAttribute("data-test-id"));
        var role = node.getAttribute && node.getAttribute("role");
        var ariaLabel = node.getAttribute && node.getAttribute("aria-label");
        if (node.id) part += "#" + String(node.id).slice(0, 80);
        else if (testId) part += '[data-testid="' + String(testId).slice(0, 80) + '"]';
        else if (role) part += '[role="' + String(role).slice(0, 40) + '"]';
        else if (ariaLabel) part += '[aria-label="' + String(ariaLabel).slice(0, 80) + '"]';
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
        testId: String(target.getAttribute && (target.getAttribute("data-testid") || target.getAttribute("data-test-id")) || "").slice(0, 120),
        ariaLabel: String(target.getAttribute && target.getAttribute("aria-label") || "").slice(0, 240),
        name: String(target.getAttribute && target.getAttribute("name") || "").slice(0, 120),
        placeholder: String(target.getAttribute && target.getAttribute("placeholder") || "").slice(0, 240),
        title: String(target.getAttribute && target.getAttribute("title") || "").slice(0, 240),
        alt: String(target.getAttribute && target.getAttribute("alt") || "").slice(0, 240),
        href: String(target.getAttribute && target.getAttribute("href") || "").slice(0, 500),
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
