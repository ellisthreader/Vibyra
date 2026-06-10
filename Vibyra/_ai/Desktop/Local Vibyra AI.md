# Desktop - Local Vibyra AI

Read this for Vibyra AI chat running locally through Ollama, especially the
top-right AI Terminals companion.

## Product Decision

Vibyra AI is specialized through a Vibyra system prompt plus bounded project
files, canonical project memory, profile preferences, terminal context, and
recent chat history. It is not fine-tuned from scratch.

The AI Terminals companion uses local AI by default. It does not require a
Vibyra cloud login, consume credits, generate images, or execute commands by
itself. It must not claim it changed files or ran commands without confirmed
tool output.

## Runtime

- Provider: Ollama at `http://127.0.0.1:11434`.
- Default model: `qwen3:4b`.
- Override model with `VIBYRA_LOCAL_MODEL`.
- Override endpoint with `VIBYRA_OLLAMA_URL`.
- Override executable with `VIBYRA_OLLAMA_BIN`.
- User install used here: `~/.local/bin/ollama`, with runtime libraries under
  `~/.local/lib/ollama`.
- Vibyra auto-starts Ollama when the status probe cannot connect.

Prefer `~/.local/bin/ollama` before a resolved target under
`~/.local/opt/ollama/bin`. Ollama resolves `llama-server` and acceleration
libraries relative to its invoked path; using the target directly can produce
`llama-server binary not found` even when the user command works.

`qwen3:4b` was selected for responsive side-chat performance on this machine's
GTX 1080 8 GB and 16 GB RAM. A real inference used about 3.5 GB VRAM.

Ollama treats `qwen3:4b` and `qwen3:4b-instruct` as distinct tags. If only the
instruct tag is installed, Vibyra should continue to report the configured
`qwen3:4b` model as missing; pull the exact tag or explicitly override
`VIBYRA_LOCAL_MODEL` instead of creating a misleading alias or fuzzy match.

## Contracts

- `GET /desktop/local-ai`: reports Ollama availability, configured model, and
  whether that model is installed.
- `POST /desktop/chat` with `provider: "local"`: uses local Ollama before any
  cloud-account requirement.
- `desktop/lib/localAi.mjs`: status, auto-start, Vibyra system prompt, bounded
  context, Ollama request, and clear offline/missing-model errors.
- `desktop/assets/app.terminals-companion-chat.js`: requests the local provider
  and displays Local, Model needed, or Offline status.

## Validation

```bash
node --test desktop/lib/localAi.test.mjs desktop/lib/desktopChat.test.mjs
npm run typecheck
curl http://127.0.0.1:4317/desktop/local-ai
```

The live bridge route returned HTTP 200 with `provider: "local"` and
`modelKey: "local/qwen3:4b"`.
