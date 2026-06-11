import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { PREVIEW_INSPECTOR_RUNTIME_SCRIPT } from "./previewInspectorRuntime.mjs";

test("Preview inspector prefers the nearest fiber source over a WebView owner", () => {
  const messages = [];
  let contextmenuHandler = null;
  const parent = { postMessage: (payload) => messages.push(payload) };
  const window = {
    parent,
    addEventListener() {}
  };
  const document = {
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    addEventListener(type, handler) {
      if (type === "contextmenu") contextmenuHandler = handler;
    },
    createElement() {
      return { remove() {}, setAttribute() {}, style: {} };
    }
  };
  const wrapperOwner = {
    type: { name: "AppWebView" },
    _debugSource: { fileName: "/src/components/AppWebView.tsx", lineNumber: 20, columnNumber: 5 }
  };
  const target = {
    "__reactFiber$test": {
      elementType: "button",
      type: "button",
      _debugOwner: wrapperOwner,
      return: {
        elementType: { name: "BuildAction" },
        type: { name: "BuildAction" },
        _debugSource: { fileName: "/src/components/BuildAction.tsx", lineNumber: 8, columnNumber: 3 },
        return: null
      }
    },
    ariaLabel: "",
    classList: [],
    getAttribute() { return ""; },
    getBoundingClientRect() { return { x: 1, y: 2, width: 100, height: 30 }; },
    innerText: "Build a feature",
    nodeType: 1,
    parentElement: null,
    tagName: "BUTTON"
  };

  vm.runInNewContext(PREVIEW_INSPECTOR_RUNTIME_SCRIPT, {
    Array,
    Math,
    Number,
    Object,
    String,
    document,
    location: { pathname: "/preview" },
    window
  });
  contextmenuHandler({
    composedPath: () => [target],
    preventDefault() {},
    shiftKey: false,
    stopImmediatePropagation() {},
    target
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].element.source.component, "BuildAction");
  assert.equal(messages[0].element.source.file, "/src/components/BuildAction.tsx");
});
