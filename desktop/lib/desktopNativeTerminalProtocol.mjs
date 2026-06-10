export function nativeRequestToResponses(protocol, body, billingModel) {
  if (protocol === "anthropic") return anthropicToResponses(body, billingModel);
  return geminiToResponses(body, billingModel);
}

export function createNativeStreamTranslator(protocol, write) {
  return protocol === "anthropic"
    ? anthropicStreamTranslator(write)
    : geminiStreamTranslator(write);
}

function anthropicToResponses(body, model) {
  const input = [];
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const content = Array.isArray(message.content) ? message.content : [{ type: "text", text: message.content }];
    const messageContent = [];
    for (const part of content) {
      if (part?.type === "text") {
        messageContent.push({
          type: "input_text",
          text: String(part.text || "")
        });
      } else if (part?.type === "tool_use") {
        input.push({
          type: "function_call",
          id: String(part.id || ""),
          call_id: String(part.id || ""),
          name: String(part.name || ""),
          arguments: JSON.stringify(part.input || {})
        });
      } else if (part?.type === "tool_result") {
        input.push({
          type: "function_call_output",
          call_id: String(part.tool_use_id || ""),
          output: anthropicContentText(part.content)
        });
      }
    }
    if (messageContent.length) input.push({ role: message.role, content: messageContent });
  }
  return {
    model,
    input,
    instructions: anthropicContentText(body.system),
    tools: (Array.isArray(body.tools) ? body.tools : []).map((tool) => ({
      type: "function",
      name: String(tool.name || ""),
      description: String(tool.description || ""),
      parameters: tool.input_schema || {}
    })),
    max_output_tokens: Number(body.max_tokens) || 2000,
    stream: true,
    store: false
  };
}

function geminiToResponses(body, model) {
  const input = [];
  const pendingCalls = new Map();
  for (const content of Array.isArray(body.contents) ? body.contents : []) {
    const role = content?.role === "model" ? "assistant" : "user";
    const textContent = [];
    for (const part of Array.isArray(content?.parts) ? content.parts : []) {
      if (typeof part?.text === "string") {
        textContent.push({ type: "input_text", text: part.text });
      }
      if (part?.functionCall) {
        const call = part.functionCall;
        const id = String(call.id || `call_${shortHash(JSON.stringify(call))}`);
        pendingCalls.set(String(call.name || ""), id);
        input.push({
          type: "function_call",
          id,
          call_id: id,
          name: String(call.name || ""),
          arguments: JSON.stringify(call.args || {})
        });
      }
      if (part?.functionResponse) {
        const response = part.functionResponse;
        input.push({
          type: "function_call_output",
          call_id: String(response.id || pendingCalls.get(String(response.name || "")) || response.name || ""),
          output: JSON.stringify(response.response || {})
        });
      }
    }
    if (textContent.length) input.push({ role, content: textContent });
  }
  const config = body.generationConfig || {};
  return {
    model,
    input,
    instructions: geminiText(body.systemInstruction?.parts),
    tools: geminiTools(body.tools),
    max_output_tokens: Number(config.maxOutputTokens) || 2000,
    stream: true,
    store: false
  };
}

function anthropicStreamTranslator(write) {
  const state = { messageStarted: false, blockIndex: -1, blockType: "", sawTool: false };
  return {
    event(event) {
      const data = event.data || {};
      const type = data.type || event.name;
      if (!state.messageStarted && type !== "error") {
        state.messageStarted = true;
        emitAnthropic(write, "message_start", {
          type: "message_start",
          message: {
            id: data.response?.id || data.item?.id || `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            model: data.response?.model || "",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: Number(data.response?.usage?.input_tokens) || 0, output_tokens: 0 }
          }
        });
      }
      if (type === "response.content_part.added" && data.part?.type === "output_text") {
        state.blockIndex += 1;
        state.blockType = "text";
        emitAnthropic(write, "content_block_start", {
          type: "content_block_start",
          index: state.blockIndex,
          content_block: { type: "text", text: "" }
        });
      } else if (type === "response.output_text.delta") {
        emitAnthropic(write, "content_block_delta", {
          type: "content_block_delta",
          index: state.blockIndex,
          delta: { type: "text_delta", text: String(data.delta || "") }
        });
      } else if (type === "response.output_item.added" && data.item?.type === "function_call") {
        state.blockIndex += 1;
        state.blockType = "tool_use";
        state.sawTool = true;
        emitAnthropic(write, "content_block_start", {
          type: "content_block_start",
          index: state.blockIndex,
          content_block: {
            type: "tool_use",
            id: String(data.item.call_id || data.item.id || ""),
            name: String(data.item.name || ""),
            input: {}
          }
        });
      } else if (type === "response.function_call_arguments.delta") {
        emitAnthropic(write, "content_block_delta", {
          type: "content_block_delta",
          index: state.blockIndex,
          delta: { type: "input_json_delta", partial_json: String(data.delta || "") }
        });
      } else if (type === "response.content_part.done" || type === "response.output_item.done") {
        if (state.blockType) {
          emitAnthropic(write, "content_block_stop", {
            type: "content_block_stop",
            index: state.blockIndex
          });
          state.blockType = "";
        }
      } else if (type === "response.completed") {
        const usage = data.response?.usage || {};
        emitAnthropic(write, "message_delta", {
          type: "message_delta",
          delta: { stop_reason: state.sawTool ? "tool_use" : "end_turn", stop_sequence: null },
          usage: { output_tokens: Number(usage.output_tokens) || 0 }
        });
        emitAnthropic(write, "message_stop", { type: "message_stop" });
      } else if (type === "response.failed" || type === "error") {
        emitAnthropic(write, "error", {
          type: "error",
          error: { type: "api_error", message: responseErrorMessage(data) }
        });
      }
    }
  };
}

function geminiStreamTranslator(write) {
  const calls = new Map();
  let completed = false;
  return {
    event(event) {
      const data = event.data || {};
      const type = data.type || event.name;
      if (type === "response.output_text.delta") {
        emitGemini(write, [{ text: String(data.delta || "") }]);
      } else if (type === "response.output_item.added" && data.item?.type === "function_call") {
        calls.set(String(data.item.id || data.item.call_id || calls.size), {
          id: String(data.item.call_id || data.item.id || ""),
          name: String(data.item.name || ""),
          args: ""
        });
      } else if (type === "response.function_call_arguments.delta") {
        const key = String(data.item_id || data.output_index || [...calls.keys()].at(-1) || "");
        const call = calls.get(key) || [...calls.values()].at(-1);
        if (call) call.args += String(data.delta || "");
      } else if (type === "response.completed" && !completed) {
        completed = true;
        const parts = [...calls.values()].map((call) => ({
          functionCall: {
            id: call.id,
            name: call.name,
            args: parsedObject(call.args)
          }
        }));
        emitGemini(write, parts, "STOP", data.response?.usage || {});
      } else if (type === "response.failed" || type === "error") {
        write(`data: ${JSON.stringify({ error: { code: 502, message: responseErrorMessage(data), status: "UNAVAILABLE" } })}\n\n`);
      }
    }
  };
}

function emitAnthropic(write, name, data) {
  write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emitGemini(write, parts, finishReason = null, usage = {}) {
  const candidate = { content: { role: "model", parts } };
  if (finishReason) candidate.finishReason = finishReason;
  write(`data: ${JSON.stringify({
    candidates: [candidate],
    usageMetadata: {
      promptTokenCount: Number(usage.input_tokens) || 0,
      candidatesTokenCount: Number(usage.output_tokens) || 0,
      totalTokenCount: (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
    }
  })}\n\n`);
}

function anthropicContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : String(part?.text || "")).filter(Boolean).join("\n");
}

function geminiText(parts) {
  return (Array.isArray(parts) ? parts : []).map((part) => String(part?.text || "")).filter(Boolean).join("\n");
}

function geminiTools(groups) {
  return (Array.isArray(groups) ? groups : []).flatMap((group) =>
    (Array.isArray(group?.functionDeclarations) ? group.functionDeclarations : []).map((fn) => ({
      type: "function",
      name: String(fn.name || ""),
      description: String(fn.description || ""),
      parameters: fn.parametersJsonSchema || fn.parameters || {}
    }))
  );
}

function parsedObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function responseErrorMessage(data) {
  return String(data.error?.message || data.response?.error?.message || "The Vibyra model request failed.");
}

function shortHash(value) {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
}
