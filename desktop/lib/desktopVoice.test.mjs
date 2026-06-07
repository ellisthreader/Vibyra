import test from "node:test";
import assert from "node:assert/strict";
import { transcribeDesktopVoice } from "./desktopVoice.mjs";

test("desktop voice requires a connected OpenAI credential", async () => {
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "YXVkaW8=" }, fetch, null),
    /Connect an OpenAI account/
  );
});

test("desktop voice sends recorded audio to OpenAI transcription", async () => {
  const credential = { apiKey: "sk-test-openai-key-1234567890", organization: "", project: "" };
  const result = await transcribeDesktopVoice(
    { audioBase64: "YXVkaW8=", mimeType: "audio/webm;codecs=opus" },
    async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/audio/transcriptions");
      assert.equal(options.headers.Authorization, "Bearer sk-test-openai-key-1234567890");
      assert.equal(options.body.get("model"), "gpt-4o-mini-transcribe");
      assert.equal(options.body.get("file").type, "audio/webm");
      assert.equal(options.body.get("file").name, "vibyra-voice.webm");
      return response({ text: "Open the memory panel." });
    },
    credential
  );
  assert.equal(result.text, "Open the memory panel.");
});

test("desktop voice rejects malformed recordings and unsupported formats", async () => {
  const credential = { apiKey: "sk-test-openai-key-1234567890", organization: "", project: "" };
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "not base64" }, fetch, credential),
    /recording is invalid/
  );
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "YXVkaW8=", mimeType: "video/webm" }, fetch, credential),
    /format is not supported/
  );
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
