use serde_json::{json, Value};

pub(crate) const NAME: &str = "vibyra_ask_user";
pub(crate) fn spec() -> Value {
    json!({"type":"function","name":NAME,"description":
    "Ask the user one to three concise questions and wait for their explicit answers. Use this for preferences or missing information. Never use this to grant execution permission.",
    "inputSchema":{"type":"object","additionalProperties":false,"required":["questions"],"properties":{
        "questions":{"type":"array","minItems":1,"maxItems":3,"items":{
            "type":"object","additionalProperties":false,
            "required":["id","header","question","options","isOther","isSecret"],"properties":{
                "id":{"type":"string"},"header":{"type":"string"},"question":{"type":"string"},
                "isOther":{"type":"boolean"},"isSecret":{"type":"boolean"},
                "options":{"type":"array","maxItems":3,"items":{"type":"object","additionalProperties":false,
                    "required":["label","description"],"properties":{"label":{"type":"string"},"description":{"type":"string"}}}}
            }
        }}
    }}})
}
pub(crate) fn valid(questions: &Value) -> bool {
    let Some(questions) = questions
        .as_array()
        .filter(|q| !q.is_empty() && q.len() <= 3)
    else {
        return false;
    };
    let mut ids = std::collections::HashSet::new();
    questions.iter().all(|q| {
        let Some(id) = q["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 128)
        else {
            return false;
        };
        ids.insert(id)
            && q["question"]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty() && s.len() <= 2048)
            && (q["options"].is_null()
                || q["options"].as_array().is_some_and(|options| {
                    let mut labels = std::collections::HashSet::new();
                    options.len() <= 8
                        && options.iter().all(|o| {
                            o["label"].as_str().is_some_and(|s| {
                                !s.trim().is_empty() && s.len() <= 512 && labels.insert(s)
                            })
                        })
                }))
    })
}
pub(crate) fn result(answers: Value) -> Value {
    json!({"contentItems":[{"type":"inputText","text":answers.to_string()}],"success":true})
}
