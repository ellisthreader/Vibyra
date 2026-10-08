use std::fs;

use tempfile::tempdir;

use super::stacks::{detect_stack, python};
use super::types::ProjectKind;

#[test]
fn recognises_each_stack_from_its_own_files() {
    let django = tempdir().unwrap();
    fs::write(django.path().join("manage.py"), "").unwrap();
    assert_eq!(
        detect_stack(django.path(), ".").unwrap().target.framework,
        "Django"
    );

    let flask = tempdir().unwrap();
    fs::write(flask.path().join("app.py"), "app = Flask(__name__)").unwrap();
    let found = detect_stack(flask.path(), ".").unwrap();
    assert_eq!(found.target.framework, "Flask");
    assert!(found
        .target
        .command
        .unwrap()
        .contains("flask --app app run"));

    let api = tempdir().unwrap();
    fs::write(api.path().join("main.py"), "app = FastAPI()").unwrap();
    assert_eq!(
        detect_stack(api.path(), ".").unwrap().info.project,
        ProjectKind::Api
    );

    let go = tempdir().unwrap();
    fs::write(go.path().join("go.mod"), "module x").unwrap();
    fs::write(go.path().join("main.go"), "import \"net/http\"").unwrap();
    assert_eq!(
        detect_stack(go.path(), ".").unwrap().target.framework,
        "Go server"
    );

    let plain = tempdir().unwrap();
    fs::write(plain.path().join("main.py"), "print('hi')").unwrap();
    assert!(detect_stack(plain.path(), ".").is_none());
}

#[test]
fn a_virtualenv_interpreter_is_preferred() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join(".venv/bin")).unwrap();
    fs::write(dir.path().join(".venv/bin/python"), "").unwrap();
    assert!(python(dir.path()).ends_with(".venv/bin/python"));
}
