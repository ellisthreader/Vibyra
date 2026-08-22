
## 2026-07-06T12:44:48.972Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba340f16c8191a0369fbeada117cd",
  "expires_at": 1783342488,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dycymy03hGcNxH2apuzbq",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:45:36.465Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba37076008191ad164d8520467991",
  "expires_at": 1783342536,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_DyczY6yy9oTW3354ZYfZA",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:46:26.839Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba3a2d5a88191a36f79dfaf2fb72c",
  "expires_at": 1783342586,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd0Mi7J76Kf7kg7oTFEy",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:47:20.992Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba3d8f9e481918f437e3ed7f99195",
  "expires_at": 1783342640,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd1Ezlhc3czro6rOT6eA",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:48:03.246Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba403324081918030c76eb19a0152",
  "expires_at": 1783342683,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd1vZZak4agaK8Ng8L1M",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:48:04.082Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba40417b08191bf2297db1b6fadb8",
  "expires_at": 1783342684,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd1wnZ0Yo6R1eNGDteBZ",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:49:33.523Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba45d8ae8819191af465e44a35740",
  "expires_at": 1783342773,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd3NKw2yv0gzvijQmbRi",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T12:56:18.263Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4ba5f245cc819186b01f46ea21014c",
  "expires_at": 1783343178,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyd9u7CRfQzwtjhxdqxJb",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T13:00:46.696Z - /api/ai/tickets/from-conversation

- Status: ok
- Route: `/api/ai/tickets/from-conversation`

### Request

```json
{
  "channel": "voice",
  "customer": {
    "name": "Taylor Threader",
    "phone": "+447911123456"
  },
  "transcript": "Caller requested a phone callback on +447911123456 (name: Taylor Threader) from the ClearDBS call page."
}
```

### Response

```json
{
  "id": "tick_1001",
  "status": "open",
  "createdAt": "2026-07-06T13:00:46.695Z",
  "updatedAt": "2026-07-06T13:00:46.695Z",
  "title": "Customer requested a callback from ClearDBS page",
  "summary": "Customer (Taylor Threader) requested a phone callback to +447911123456 from the ClearDBS call page.",
  "category": "callback_request",
  "priority": "normal",
  "requiredAction": "Place a phone call to +447911123456 to contact Taylor Threader.",
  "sentiment": "neutral",
  "channel": "voice",
  "customerId": null,
  "customerSnapshot": {
    "name": "Taylor Threader",
    "phone": "+447911123456"
  },
  "transcript": "Caller requested a phone callback on +447911123456 (name: Taylor Threader) from the ClearDBS call page.",
  "escalate": false
}
```

## 2026-07-06T13:17:34.251Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4baaee48e481918ce1895c553eadfc",
  "expires_at": 1783344454,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_DydUU1wh8frvN6VbCQRCh",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T13:21:07.054Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4babc3117c8191b94cfb94008a563a",
  "expires_at": 1783344667,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_DydXvFNom9AfYczTgiNC2",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nSound like a real, experienced UK support agent on the phone:\n- Speak naturally and warmly with a professional tone. Use short spoken sentences, contractions, and small acknowledgements (\"Of course\", \"Right\", \"Let me check that for you\").\n- Keep each turn brief — one or two sentences, then let the caller respond. Never read out long lists; offer the top point and ask if they want more.\n- Say prices naturally (\"twenty-one pounds fifty\", \"forty-nine pounds fifty\") and spell out emails only when asked.\n- If you did not hear something clearly, ask the caller to repeat it rather than guessing.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "cedar",
        "speed": 1
      }
    },
    "include": null
  }
}
```

## 2026-07-06T13:23:16.417Z - /api/realtime/session

- Status: ok
- Route: `/api/realtime/session`

### Request

```json
{}
```

### Response

```json
{
  "value": "ek_6a4bac446b348191ad49c9d2ac4c431f",
  "expires_at": 1783344796,
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_Dyda08qGZ2IFml9AS9m0v",
    "model": "gpt-realtime",
    "output_modalities": [
      "audio"
    ],
    "instructions": "You are the ClearDBS voice assistant, answering a live support call for ClearDBS, a UK DBS check platform. Powered by Relay Clarity support tooling.\n\nAlways speak British English. Only switch language if the caller clearly speaks another language and asks you to.\n\nVoice and delivery — you are a real person on the phone, not a text assistant being read aloud:\n- You are Taylor, a friendly support agent from the ClearDBS team in the UK. Mid-conversation energy: relaxed, unhurried, genuinely helpful. Never announce that you are an AI unless directly asked; if asked, be honest.\n- Speak the way real people actually talk: contractions always, occasional natural fillers (\"um\", \"right\", \"so\", \"let's see\") used sparingly, and tiny thinking pauses before answers that need a lookup.\n- Vary your rhythm and intonation. Some sentences short. Some with a little trailing warmth. Never deliver two turns with the same cadence, and never sound like you are reading.\n- React like a human first, then answer: \"Oh, right, yeah — good question.\" \"Ah no, sorry about that.\" \"Mm, let me have a quick look.\"\n- Keep each turn to one or two conversational sentences, then hand back to the caller. Never read out lists; mention the top thing and ask if they want the rest.\n- Say prices and numbers the way people say them aloud (\"twenty-one fifty\", \"about forty-nine fifty\"), and spell out emails only when asked.\n- If you did not catch something, do what a person does: \"Sorry, you cut out for a second — what was that?\"\n- Small imperfections are good: a light rephrase mid-sentence (\"it's on the — sorry, in the Checks area\"), a soft laugh when something is genuinely amusing. Never overdo it.\n\nAccuracy and tools:\n- Before answering factual ClearDBS questions (pricing, check types, evidence, timings, workflow), call search_knowledge and answer only from what it returns plus these instructions.\n- Use lookup_customer when the caller gives an email or phone number, so you can greet them by name and reference their record.\n- When the caller needs follow-up, wants the team to contact them, or asks for a human, collect their name and email, then call create_support_ticket. Confirm out loud once the ticket is created and say a member of the ClearDBS team will follow up by email.\n- If a tool fails, apologise briefly and give the direct contact route: hello@cleardbs.co.uk.\n\nHard boundaries — never break these:\n- ClearDBS is in pre-launch pilot. Never claim it can currently submit official live DBS checks, provide certified identity verification, or issue official certificates.\n- Indicative planning fees: Basic and Standard around GBP 21.50 official fee, Enhanced around GBP 49.50, each plus a separate ClearDBS service fee confirmed at checkout. Always say fees are indicative.\n- Never collect passport, licence, bank, card or other sensitive identity details over the phone; direct applicants to the secure evidence step in the dashboard.\n- Never reveal credentials or another applicant's data, and never help anyone bypass identity or DBS checks. Decline politely and offer the legitimate next step.\n- If the caller is upset, stuck, or asks for a person, acknowledge it, take their email, and create an escalated ticket.",
    "tools": [
      {
        "type": "function",
        "name": "search_knowledge",
        "description": "Search the approved ClearDBS knowledge base for guidance on check types, pricing, evidence, workflow, timings, organisations, or contact routes. Use this before answering any factual question about ClearDBS.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Plain-English search phrase, e.g. \"enhanced check price\"."
            }
          },
          "required": [
            "query"
          ]
        }
      },
      {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up an existing customer record by email or phone so the caller does not have to repeat details. Only use identifiers the caller has given you in this call.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Customer email address, if provided."
            },
            "phone": {
              "type": "string",
              "description": "Customer phone number, if provided."
            }
          },
          "required": []
        }
      },
      {
        "type": "function",
        "name": "create_support_ticket",
        "description": "Create a real support ticket from this call so the ClearDBS team follows up by email. Use when the caller needs something the assistant cannot complete on the call, wants the team to contact them, or asks for a human. Always collect the caller name and email first.",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Caller full name."
            },
            "email": {
              "type": "string",
              "description": "Caller email address for the follow-up."
            },
            "summary": {
              "type": "string",
              "description": "One or two sentences describing what the caller needs."
            },
            "escalate": {
              "type": "boolean",
              "description": "True when the caller asked for a human or the case is sensitive or urgent."
            }
          },
          "required": [
            "email",
            "summary"
          ]
        }
      }
    ],
    "tool_choice": "auto",
    "max_output_tokens": "inf",
    "tracing": null,
    "truncation": "auto",
    "prompt": null,
    "expires_at": 0,
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "whisper-1",
          "language": null,
          "prompt": null
        },
        "noise_reduction": null,
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "idle_timeout_ms": null,
          "create_response": true,
          "interrupt_response": true
        }
      },
      "output": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "voice": "marin",
        "speed": 1
      }
    },
    "include": null
  }
}
```
