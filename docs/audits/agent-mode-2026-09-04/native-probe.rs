
use vibyra_core::{approvals,agent_profiles,agent_model::{PermissionMode,PlaceAccess},agent_runtime};
fn main(){
 for command in ["sed -n '1w /tmp/audit-created' /tmp/input", "sort -o /tmp/audit-created /tmp/input", "git tag audit-created", "git stash", "git remote add audit https://example.invalid/repo", "cat /etc/passwd"]{
  let risk=approvals::bash_risk(command);
  println!("CLASSIFIER {:?} => {:?} / {:?}",command,risk,approvals::decide(risk,true));
 }
 for (name,input) in [("Read",serde_json::json!({"file_path":"/not-granted/credentials.json"})),("Task",serde_json::json!({"prompt":"Change a file"}))]{println!("TOOL {} => {:?}",name,approvals::classify(name,&input));}
 let change:agent_profiles::AgentUpdate=serde_json::from_str(r#"{"model":null,"effort":null}"#).unwrap();
 println!("NULL_CLEAR model={:?} effort={:?}",change.model,change.effort);
 let place=agent_profiles::AgentPlace{id:"p".into(),agent_id:"a".into(),path:"/read-only-grant".into(),access:PlaceAccess::Read,label:"".into(),created_ms:0};
 let dirs=agent_profiles::directory_arguments(&[place],true);
 println!("READ_GRANT_CODEX_ARGS {:?}",agent_runtime::codex::start_args("/tmp",PermissionMode::Standard,&dirs,None,None,&[]));
 println!("CLAUDE_GATE_DOWN {}",agent_runtime::claude::permission_mode(PermissionMode::Standard,false));
 let root=std::path::Path::new("/tmp/vibyra-agent-audit-20260904/fake-account");
 let victim=std::path::Path::new("/tmp/vibyra-agent-audit-20260904/scratch-delete-target");
 std::fs::create_dir_all(victim).unwrap();std::fs::write(victim.join("only-audit-fixture.txt"),"dummy").unwrap();
 vibyra_core::agent_chats::attachments::discard(root,victim.to_str().unwrap());
 println!("ABSOLUTE_CHAT_ID_REMOVED_SCRATCH_OUTSIDE_ACCOUNT {}",!victim.exists());
}
