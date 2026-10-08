use super::*;

#[test]
fn comments_round_trip_per_project() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(
        load_comments(dir.path(), "/p/one"),
        json!({ "comments": [] })
    );
    let list = json!([{ "id": "c1", "text": "fix", "from": 1, "to": 2 }]);
    save_comments(dir.path(), "/p/one", list.clone()).unwrap();
    assert_eq!(
        load_comments(dir.path(), "/p/one"),
        json!({ "comments": list })
    );
    assert_eq!(
        load_comments(dir.path(), "/p/two"),
        json!({ "comments": [] })
    );
    let saved = file_for(dir.path(), "/p/one");
    assert_eq!(
        saved.file_name().unwrap().len(),
        "0123456789abcdef.json".len()
    );
    let stored: Value = serde_json::from_slice(&std::fs::read(&saved).unwrap()).unwrap();
    assert_eq!(stored["projectRoot"], "/p/one");
}

#[test]
fn a_damaged_file_reads_as_no_comments() {
    let dir = tempfile::tempdir().unwrap();
    let path = file_for(dir.path(), "/p");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "{not json").unwrap();
    assert_eq!(load_comments(dir.path(), "/p"), json!({ "comments": [] }));
    std::fs::write(&path, r#"{"projectRoot":"/p","comments":{}}"#).unwrap();
    assert_eq!(load_comments(dir.path(), "/p"), json!({ "comments": [] }));
    std::fs::write(&path, r#"{"projectRoot":"/other","comments":[{"id":"x"}]}"#).unwrap();
    assert_eq!(load_comments(dir.path(), "/p"), json!({ "comments": [] }));
}

#[test]
fn saving_checks_the_shape_and_size() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path();
    assert!(save_comments(path, "/p", json!({})).is_err());
    assert!(save_comments(path, "/p", json!([{ "text": "no id" }])).is_err());
    assert!(save_comments(path, "/p", json!([{ "id": 7 }])).is_err());
    assert!(save_comments(path, "/p", json!(["c1"])).is_err());
    let many: Vec<Value> = (0..=MAX_COMMENTS)
        .map(|n| json!({ "id": n.to_string() }))
        .collect();
    assert!(save_comments(path, "/p", Value::Array(many)).is_err());
    let huge = json!([{ "id": "a", "text": "x".repeat(MAX_BYTES) }]);
    assert!(save_comments(path, "/p", huge).is_err());
    assert!(!file_for(path, "/p").exists());
    save_comments(path, "/p", json!([])).unwrap();
    assert_eq!(load_comments(path, "/p"), json!({ "comments": [] }));
}
