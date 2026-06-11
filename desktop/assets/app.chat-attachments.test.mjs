import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attachments = readFileSync(new URL("./app.chat-attachments.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const send = readFileSync(new URL("./app.chat-send.js", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("desktop chat accepts dropped image files and stages real image data", () => {
  assert.match(attachments, /addEventListener\("dragover"/);
  assert.match(attachments, /addEventListener\("drop"/);
  assert.match(attachments, /event\.dataTransfer\?\.files/);
  assert.match(attachments, /reader\.readAsDataURL\(file\)/);
  assert.match(attachments, /image\/png/);
  assert.match(attachments, /maxChatImageBytes/);
  assert.match(pages, /bindChatAttachmentDrop\(\)/);
  assert.match(state, /let chatImageAttachments = \[\]/);
  assert.match(send, /imageAttachments/);
  assert.match(app, /app\.chat-attachments\.js/);
});

test("dropped PNG data is staged for the next desktop chat request", async () => {
  const context = vm.createContext({
    Set,
    chatAttachments: [],
    chatImageAttachments: [],
    openChatMenu: "attach",
    renderChat: () => { context.rendered = true; },
    showScreenshotNotice: () => {},
    FileReader: class {
      addEventListener(type, listener) {
        this[type] = listener;
      }
      readAsDataURL() {
        this.result = "data:image/png;base64,iVBORw0KGgo=";
        this.load();
      }
    }
  });
  vm.runInContext(attachments, context);

  await vm.runInContext(`stageChatAttachmentFiles([{
    name: "screen.png",
    size: 1200,
    type: "image/png",
    webkitRelativePath: ""
  }])`, context);

  assert.deepEqual([...context.chatAttachments], ["screen.png"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.chatImageAttachments)),
    [{ name: "screen.png", url: "data:image/png;base64,iVBORw0KGgo=" }]
  );
  assert.equal(context.openChatMenu, "");
  assert.equal(context.rendered, true);
});

test("dropped screenshot paths append to the chat composer", () => {
  const input = {
    focusCalled: false,
    focus() { this.focusCalled = true; },
    value: "Review"
  };
  const storage = new Map();
  const context = vm.createContext({
    Set,
    chatDraft: "",
    document: { getElementById: () => input },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    renderSendState: () => { context.rendered = true; }
  });
  vm.runInContext(attachments, context);

  vm.runInContext(`insertChatScreenshotPath(
    "'/home/ellis/.vibyra-desktop/screenshots/example.png'"
  )`, context);

  assert.equal(input.value, "Review '/home/ellis/.vibyra-desktop/screenshots/example.png'");
  assert.equal(context.chatDraft, input.value);
  assert.equal(storage.get("vibyra.desktop.chatDraft"), input.value);
  assert.equal(input.focusCalled, true);
  assert.equal(context.rendered, true);
});
