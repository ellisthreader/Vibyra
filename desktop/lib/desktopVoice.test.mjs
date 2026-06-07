import test from "node:test";
import assert from "node:assert/strict";
import { transcribeDesktopVoice } from "./desktopVoice.mjs";

test("desktop voice requires a connected OpenAI credential", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(() => transcribeDesktopVoice({ audioBase64: "YXVkaW8=" }), /Connect an OpenAI account/);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

test("desktop voice sends recorded audio to OpenAI transcription", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-openai-key-1234567890";
  try {
    const result = await transcribeDesktopVoice({ audioBase64: "YXVkaW8=", mimeType: "audio/webm" }, async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/audio/transcriptions");
      assert.equal(options.headers.Authorization, "Bearer sk-test-openai-key-1234567890");
      assert.equal(options.body.get("model"), "gpt-4o-mini-transcribe");
      return response({ text: "Open the memory panel." });
    });
    assert.equal(result.text, "Open the memory panel.");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
