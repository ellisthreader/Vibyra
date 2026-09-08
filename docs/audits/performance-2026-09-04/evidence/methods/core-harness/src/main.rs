use std::{fs, path::PathBuf, sync::{Arc,atomic::{AtomicUsize,Ordering}}, time::{Instant,Duration}};
use vibyra_core::fsx::WorkspaceWatcher;
fn watch_count()->usize {
 fs::read_dir("/proc/self/fdinfo").unwrap().flatten().filter_map(|e|fs::read_to_string(e.path()).ok()).map(|s|s.lines().filter(|l|l.starts_with("inotify wd:")).count()).sum()
}
fn main(){
 let out=PathBuf::from("/tmp/vibyra-performance-audit-20260904-KNtjVg");
 let mut rows=Vec::new();
 for count in [0,100,1000,3000] {
  let root=out.join(format!("watch-fixture-{count}"));fs::create_dir_all(root.join("src")).unwrap();
  for n in 0..count {fs::create_dir_all(root.join(format!("node_modules/pkg{n}"))).unwrap();}
  let called=Arc::new(AtomicUsize::new(0));let delivered=called.clone();
  let before=watch_count();let begin=Instant::now();
  let watcher=WorkspaceWatcher::start(root.to_str().unwrap(),move|events|{delivered.fetch_add(events.len(),Ordering::Relaxed);}).unwrap();
  let ms=begin.elapsed().as_secs_f64()*1000.;let added=watch_count()-before;
  if count>0 {for n in 0..count.min(100){fs::write(root.join(format!("node_modules/pkg{n}/churn.js")),"fixture").unwrap();}}
  std::thread::sleep(Duration::from_millis(700));
  let ignored_delivered=called.load(Ordering::Relaxed);
  fs::write(root.join("src/visible.ts"),"fixture").unwrap();std::thread::sleep(Duration::from_millis(700));
  rows.push(serde_json::json!({"ignoredDirectories":count,"watchStartMs":ms,"kernelWatchesAdded":added,"ignoredEventsDelivered":ignored_delivered,"sourceEventDelivered":called.load(Ordering::Relaxed)>ignored_delivered}));
  drop(watcher);
 }
 let report=serde_json::json!({"kind":"Actual WorkspaceWatcher on synthetic directories; Linux inotify metadata; debug build","rows":rows});
 fs::write(out.join("watcher-bench.json"),serde_json::to_string_pretty(&report).unwrap()).unwrap();println!("{report}");
}
