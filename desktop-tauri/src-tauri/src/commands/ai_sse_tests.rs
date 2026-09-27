use super::ai_sse::{Frame, SseReader};

/// A frame as one short string, so a test reads as the sequence it expects
/// rather than as a match arm per case.
fn label(frame: &Frame) -> String {
    match frame {
        Frame::Text(text) => format!("text:{text}"),
        Frame::Usage {
            input_tokens,
            output_tokens,
        } => format!("usage:{input_tokens}/{output_tokens}"),
        Frame::Tool {
            index,
            id,
            name,
            arguments,
        } => format!(
            "tool:{index}:{}:{}:{arguments}",
            id.clone().unwrap_or_default(),
            name.clone().unwrap_or_default()
        ),
        Frame::Error(message) => format!("error:{message}"),
        Frame::Done => "done".to_string(),
    }
}

fn push(reader: &mut SseReader, chunk: &str) -> Vec<String> {
    reader
        .push(chunk.as_bytes())
        .unwrap()
        .iter()
        .map(label)
        .collect()
}

fn delta(text: &str) -> String {
    format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{text}\"}}}}]}}\n\n")
}

#[test]
fn a_frame_split_across_chunks_parses_once() {
    let frame = delta("hello");
    let (head, tail) = frame.split_at(20);
    let mut reader = SseReader::new();
    assert!(push(&mut reader, head).is_empty());
    assert_eq!(push(&mut reader, tail), ["text:hello"]);
}

#[test]
fn two_frames_in_one_chunk_keep_their_order() {
    let mut reader = SseReader::new();
    let chunk = format!("{}{}", delta("one "), delta("two"));
    assert_eq!(push(&mut reader, &chunk), ["text:one ", "text:two"]);
}

#[test]
fn a_multi_byte_character_split_across_chunks_survives() {
    let frame = delta("ready — go");
    // Cut inside the em dash, so its three bytes arrive in two chunks.
    let cut = frame.find('—').unwrap() + 1;
    let mut reader = SseReader::new();
    assert!(reader.push(&frame.as_bytes()[..cut]).unwrap().is_empty());
    let frames = reader.push(&frame.as_bytes()[cut..]).unwrap();
    assert_eq!(
        frames.iter().map(label).collect::<Vec<_>>(),
        ["text:ready — go"]
    );
}

#[test]
fn the_done_marker_ends_the_stream() {
    let mut reader = SseReader::new();
    // A real reply: the role-only opener, the text, the finish_reason closer,
    // then the marker. Only two of those four carry anything.
    let stream = format!(
        "data: {{\"choices\":[{{\"delta\":{{\"role\":\"assistant\"}}}}]}}\n\n\
         {}data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"stop\"}}]}}\n\n\
         data: [DONE]\n\n",
        delta("hi")
    );
    assert_eq!(push(&mut reader, &stream), ["text:hi", "done"]);
}

#[test]
fn the_usage_chunk_carries_no_choices() {
    let mut reader = SseReader::new();
    let chunk = "data: {\"choices\":[],\"usage\":\
                 {\"prompt_tokens\":112,\"completion_tokens\":7}}\n\n";
    assert_eq!(push(&mut reader, chunk), ["usage:112/7"]);
    // Every other chunk sends `"usage": null`, which must not settle at zero.
    let quiet = "data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}],\"usage\":null}\n\n";
    assert_eq!(push(&mut reader, quiet), ["text:x"]);
}

#[test]
fn an_error_chunk_becomes_an_error() {
    let mut reader = SseReader::new();
    let chunk = "data: {\"error\":{\"message\":\"rate limit reached\"}}\n\n";
    assert_eq!(push(&mut reader, chunk), ["error:rate limit reached"]);
}

#[test]
fn comments_and_keep_alives_are_ignored() {
    let mut reader = SseReader::new();
    assert!(push(&mut reader, ": ping\n\n:\n\n").is_empty());
    let chunk = format!("event: message\n{}", delta("still here"));
    assert_eq!(push(&mut reader, &chunk), ["text:still here"]);
}

#[test]
fn crlf_framing_parses() {
    let mut reader = SseReader::new();
    let chunk =
        "data: {\"choices\":[{\"delta\":{\"content\":\"crlf\"}}]}\r\n\r\ndata: [DONE]\r\n\r\n";
    assert_eq!(push(&mut reader, chunk), ["text:crlf", "done"]);
}

#[test]
fn a_frame_that_never_ends_is_refused() {
    let mut reader = SseReader::new();
    let flood = format!("data: {}", "x".repeat(600_000));
    assert!(reader.push(flood.as_bytes()).unwrap().is_empty());
    assert!(reader.push(flood.as_bytes()).is_err());
}

#[test]
fn unreadable_json_is_skipped_rather_than_fatal() {
    let mut reader = SseReader::new();
    let chunk = format!("data: <html>502 Bad Gateway</html>\n\n{}", delta("fine"));
    assert_eq!(push(&mut reader, &chunk), ["text:fine"]);
}

#[test]
fn a_tool_call_arrives_in_fragments_that_name_themselves_once() {
    let mut reader = SseReader::new();
    // The id and the name come with the first fragment only; every later one
    // carries a few more characters of the arguments under the same index.
    let first = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"open_terminals","arguments":"{\"co"}}]}}]}

"#;
    let second = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"unt\":3}"}}]}}]}

"#;
    assert_eq!(
        push(&mut reader, first),
        [r#"tool:0:call_1:open_terminals:{"co"#]
    );
    assert_eq!(push(&mut reader, second), [r#"tool:0:::unt":3}"#]);
}
