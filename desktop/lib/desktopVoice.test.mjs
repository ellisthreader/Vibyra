import test from "node:test";
import assert from "node:assert/strict";
import { speakDesktopVoice, transcribeDesktopVoice } from "./desktopVoice.mjs";

const credential = { apiKey: "sk-test-openai-key-1234567890", organization: "", project: "" };

test("desktop voice requires a connected OpenAI credential", async () => {
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "YXVkaW8=" }, fetch, null),
    /Connect an OpenAI account/
  );
});

test("desktop voice sends recorded audio to OpenAI transcription", async () => {
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
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "not base64" }, fetch, credential),
    /recording is invalid/
  );
  await assert.rejects(
    () => transcribeDesktopVoice({ audioBase64: "YXVkaW8=", mimeType: "video/webm" }, fetch, credential),
    /format is not supported/
  );
});

test("desktop voice speech requires a connected OpenAI credential", async () => {
  await assert.rejects(
    () => speakDesktopVoice({ text: "Hello." }, fetch, null),
    errorWithStatus(401, /Connect an OpenAI account/)
  );
});

test("desktop voice speech requests the selected voice and speed as WAV audio", async () => {
  const expected = Buffer.from("RIFF-test-wav");
  const result = await speakDesktopVoice(
    { text: "  Your build\ncompleted successfully.  ", voice: "cedar", speed: 1.25 },
    async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/audio/speech");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer sk-test-openai-key-1234567890");
      assert.equal(options.headers["Content-Type"], "application/json");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-4o-mini-tts");
      assert.equal(body.voice, "cedar");
      assert.equal(body.speed, 1.25);
      assert.equal(body.input, "Your build completed successfully.");
      assert.equal(body.response_format, "wav");
      assert.match(body.instructions, /Vibyra/);
      assert.match(body.instructions, /concise/);
      return audioResponse(expected);
    },
    credential
  );
  assert.equal(result.contentType, "audio/wav");
  assert.deepEqual(result.audio, expected);
});

test("desktop voice speech defaults to marin at normal speed", async () => {
  await speakDesktopVoice(
    { text: "Use the defaults." },
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.voice, "marin");
      assert.equal(body.speed, 1);
      return audioResponse(Buffer.from("RIFF-defaults"));
    },
    credential
  );
});

test("desktop voice speech accepts every built-in OpenAI speech voice", async () => {
  const voices = [
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
    "onyx", "sage", "shimmer", "verse", "marin", "cedar"
  ];
  for (const voice of voices) {
    await speakDesktopVoice(
      { text: `Testing ${voice}.`, voice, speed: voice === "alloy" ? 0.25 : 4 },
      async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.voice, voice);
        assert.ok(body.speed === 0.25 || body.speed === 4);
        return audioResponse(Buffer.from(`RIFF-${voice}`));
      },
      credential
    );
  }
});

test("desktop voice speech rejects empty and oversized text before requesting audio", async () => {
  let requests = 0;
  const request = async () => {
    requests += 1;
    return audioResponse(Buffer.from("unused"));
  };
  await assert.rejects(
    () => speakDesktopVoice({ text: " \n " }, request, credential),
    errorWithStatus(422, /text is required/)
  );
  await assert.rejects(
    () => speakDesktopVoice({ text: "x".repeat(1601) }, request, credential),
    errorWithStatus(413, /1600 characters or fewer/)
  );
  assert.equal(requests, 0);
});

test("desktop voice speech rejects unsupported voices and speeds before requesting audio", async () => {
  let requests = 0;
  const request = async () => {
    requests += 1;
    return audioResponse(Buffer.from("unused"));
  };
  await assert.rejects(
    () => speakDesktopVoice({ text: "Hello.", voice: "unknown" }, request, credential),
    errorWithStatus(422, /voice is not supported/)
  );
  await assert.rejects(
    () => speakDesktopVoice({ text: "Hello.", speed: 4.01 }, request, credential),
    errorWithStatus(422, /between 0.25 and 4/)
  );
  await assert.rejects(
    () => speakDesktopVoice({ text: "Hello.", speed: 0.24 }, request, credential),
    errorWithStatus(422, /between 0.25 and 4/)
  );
  assert.equal(requests, 0);
});

test("desktop voice speech maps upstream failures without exposing credentials", async () => {
  await assert.rejects(
    () => speakDesktopVoice(
      { text: "Try again." },
      async () => response({ error: { message: "secret sk-upstream-leak" } }, 500),
      credential
    ),
    (error) => {
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /secret|sk-upstream-leak/);
      return true;
    }
  );
});

test("desktop voice speech maps request timeouts", async () => {
  await assert.rejects(
    () => speakDesktopVoice(
      { text: "This will time out." },
      async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }),
      credential,
      5
    ),
    errorWithStatus(504, /timed out/)
  );
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

function audioResponse(audio, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    }
  };
}

function errorWithStatus(status, message) {
  return (error) => {
    assert.equal(error.status, status);
    assert.match(error.message, message);
    return true;
  };
}
