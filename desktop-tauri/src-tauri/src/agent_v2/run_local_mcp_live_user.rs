use super::*;
pub(super) struct User {
    pub base: String,
    pub token: String,
}
impl User {
    pub async fn call(&self, method: Method, path: &str, body: Value) -> Value {
        send(
            &self.base,
            Some(&self.token),
            None,
            method,
            path,
            (!body.is_null()).then_some(body),
        )
        .await
        .unwrap_or_else(|e| panic!("QA endpoint {path}: {e}"))
        .unwrap_or(Value::Null)
    }
    pub async fn teammate(&self) -> String {
        let response = reqwest::Client::new().post(format!("{}/api/agents/v1/teammates",self.base))
            .bearer_auth(&self.token).json(&json!({"id":uuid::Uuid::new_v4().to_string(),"name":"Disposable MCP acceptance",
                "brief":"Only the explicitly scoped filesystem acceptance task.","memory":null,"avatar":"qa","budget":10,"integrations":[]}))
            .send().await.unwrap();
        assert!(response.status().is_success());
        response.json::<Value>().await.unwrap()["teammate"]["id"]
            .as_str()
            .unwrap()
            .into()
    }
    pub async fn approve_exact(&self, run: &str, tool: &str, target: &std::path::Path) -> bool {
        for _ in 0..90 {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let result = self
                .call(Method::GET, &format!("runs/{run}"), Value::Null)
                .await;
            for action in result["run"]["actions"].as_array().unwrap() {
                if action["state"] != "pending_approval" {
                    continue;
                }
                assert_eq!(action["tool"], tool);
                assert_eq!(action["arguments"]["path"], target.to_str().unwrap());
                assert_eq!(action["arguments"]["content"], "MCP live receipt 42");
                assert!(!target.exists(), "No write before approval");
                let id = action["id"].as_str().unwrap();
                self.call(
                    Method::POST,
                    &format!("actions/{id}/decision"),
                    json!({"fingerprint":action["fingerprint"],"decision":"allow"}),
                )
                .await;
                return true;
            }
        }
        false
    }
    pub async fn review_change(
        &self,
        host: &str,
        spec: &ServerSpec,
        tools: &[vibyra_core::local_mcp::ToolDef],
        connection: &str,
    ) {
        let mut changed: Vec<Value> = tools.iter().map(|t| t.catalogue()).collect();
        changed[0]["description"] = json!("Changed for explicit review acceptance");
        let result = self
            .call(
                Method::POST,
                "local-mcp/servers",
                json!({"hostId":host,"localId":spec.id,"name":spec.name,"tools":changed}),
            )
            .await;
        assert_eq!(result["server"]["status"], "tools_changed");
        let revision = result["server"]["pending"]["revision"].clone();
        assert!(revision.is_string());
        self.call(
            Method::POST,
            &format!("local-mcp/servers/{connection}/approve"),
            json!({"revision":revision}),
        )
        .await;
        eprintln!("PASS production catalogue change requires explicit review");
    }
}
