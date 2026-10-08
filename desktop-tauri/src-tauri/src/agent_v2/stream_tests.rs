use super::*;

const INIT: &str = r#"{"type":"system","subtype":"init","cwd":"/private/tmp/r/work","session_id":"s","tools":["mcp__vibyra-broker__gmail_search"],"mcp_servers":[{"name":"vibyra-broker","status":"connected"}],"model":"claude-haiku-4-5","permissionMode":"dontAsk","slash_commands":[],"apiKeySource":"none","claude_code_version":"2.1.285","skills":[],"plugins":[]}"#;
const DELTA: &str = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}},"session_id":"s","parent_tool_use_id":null}"#;
const ARGS: &str = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"q"}},"session_id":"s"}"#;
const TOOL: &str = r#"{"type":"assistant","message":{"id":"msg_1","role":"assistant","content":[{"type":"tool_use","id":"toolu_01","name":"mcp__vibyra-broker__gmail_search","input":{"query":"is:unread"}}]},"session_id":"s"}"#;
const TEXT: &str = r#"{"type":"assistant","message":{"id":"msg_2","content":[{"type":"text","text":"You have "},{"type":"text","text":"2 emails."}]}}"#;
const LIMIT: &str = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","rateLimitType":"five_hour","resetsAt":1790000000,"overageStatus":"rejected"},"session_id":"s"}"#;
const RESULT: &str = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":10,"result":"You have 2 emails.","stop_reason":"end_turn","total_cost_usd":0.01,"usage":{"input_tokens":3}}"#;
const ERROR: &str =
    r#"{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["boom"]}"#;
const CONTROL: &str = r#"{"type":"control_response","response":{"subtype":"success","request_id":"init","response":{"account":{"email":"a@b.c","subscriptionType":"Claude Max","apiProvider":"firstParty"}}}}"#;

#[test]
fn init_carries_the_effective_tool_surface() {
    let Line::Init(init) = parse(INIT) else {
        panic!()
    };
    assert_eq!(init.tools, ["mcp__vibyra-broker__gmail_search"]);
    assert_eq!(
        init.mcp_servers,
        [("vibyra-broker".to_owned(), "connected".to_owned())]
    );
    assert_eq!(init.api_key_source, "none");
    assert_eq!(init.version, "2.1.285");
}

#[test]
fn deltas_tool_calls_and_text_are_told_apart() {
    assert_eq!(parse(DELTA), Line::TextDelta("Hel".into()));
    assert_eq!(parse(ARGS), Line::Other);
    assert_eq!(
        parse(TOOL),
        Line::ToolUse {
            id: "toolu_01".into(),
            name: "mcp__vibyra-broker__gmail_search".into()
        }
    );
    assert_eq!(
        parse(TEXT),
        Line::AssistantText("You have 2 emails.".into())
    );
    assert_eq!(parse("not json"), Line::Other);
}

#[test]
fn results_limits_and_control_responses_parse() {
    assert_eq!(
        parse(RESULT),
        Line::Result {
            is_error: false,
            subtype: "success".into(),
            text: "You have 2 emails.".into()
        }
    );
    assert_eq!(
        parse(ERROR),
        Line::Result {
            is_error: true,
            subtype: "error_during_execution".into(),
            text: "boom".into()
        }
    );
    assert_eq!(
        parse(LIMIT),
        Line::RateLimit {
            status: "rejected".into(),
            resets_at: Some(1_790_000_000)
        }
    );
    let Line::ControlResponse { id, ok, body, .. } = parse(CONTROL) else {
        panic!()
    };
    assert_eq!((id.as_str(), ok), ("init", true));
    assert_eq!(body["account"]["apiProvider"], "firstParty");
}

#[test]
fn failures_map_to_contract_codes() {
    assert_eq!(classify_failure("success", "x", true).0, "limits");
    assert_eq!(
        classify_failure("success", "Claude AI usage limit reached|1790000000", false).0,
        "limits"
    );
    assert_eq!(
        classify_failure("success", "Invalid API key · Please run /login", false).0,
        "provider_signin"
    );
    assert_eq!(
        classify_failure("success", "OAuth token has expired", false).0,
        "provider_signin"
    );
    assert_eq!(
        classify_failure("error_max_turns", "", false).0,
        "step_limit"
    );
    assert_eq!(
        classify_failure("error_during_execution", "boom", false).0,
        "provider_error"
    );
}
