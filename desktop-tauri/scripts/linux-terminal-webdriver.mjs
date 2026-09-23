import { setTimeout as delay } from "node:timers/promises";

const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";

export class NativeDriver {
  constructor(port, process) {
    this.port = port;
    this.process = process;
    this.session = null;
  }

  async request(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error) {
      throw new Error(result.value?.message || JSON.stringify(result));
    }
    return result.value;
  }

  async until(check, description, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      if (this.process.exitCode !== null) throw new Error(`tauri-driver exited ${this.process.exitCode}`);
      try {
        const result = await check();
        if (result) return result;
      } catch (error) { last = error; }
      await delay(75);
    }
    throw new Error(`${description} timed out. ${last?.message || ""}`);
  }

  async start(application) {
    await this.until(() => this.request("GET", "/status"), "WebKit driver startup");
    const response = await this.request("POST", "/session", {
      capabilities: { alwaysMatch: {
        browserName: "wry", "tauri:options": { application },
      } },
    });
    this.session = response.sessionId;
    if (!this.session) throw new Error("WebKit did not open the AppImage");
    await this.request("POST", `/session/${this.session}/window/rect`, {
      width: 1440, height: 900, x: 0, y: 0,
    });
  }

  execute(script, args = []) {
    return this.request("POST", `/session/${this.session}/execute/sync`, { script, args });
  }

  executeAsync(script, args = []) {
    return this.request("POST", `/session/${this.session}/execute/async`, { script, args });
  }

  async invoke(command, args = {}) {
    const result = await this.executeAsync(`const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1])
        .then(value => done({ value }), error => done({ error: String(error) }));`,
    [command, args]);
    if (result.error) throw new Error(`${command}: ${result.error}`);
    return result.value;
  }

  async element(selector) {
    const result = await this.request("POST", `/session/${this.session}/element`, {
      using: "css selector", value: selector,
    });
    return result[ELEMENT];
  }

  click(selector) {
    return this.element(selector).then(id => this.request(
      "POST", `/session/${this.session}/element/${id}/click`, {},
    ));
  }

  async keys(selector, text) {
    const id = await this.element(selector);
    await this.request("POST", `/session/${this.session}/element/${id}/value`, {
      text, value: [...text],
    });
  }

  screenshot() {
    return this.request("GET", `/session/${this.session}/screenshot`)
      .then(value => Buffer.from(value, "base64"));
  }
}
