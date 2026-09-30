"""Fetch the exact immutable successful Mac build without trusting release claims."""
import hashlib
import json
import re
import stat
import subprocess
import zipfile
from pathlib import Path


def api(repository, path):
    return json.loads(subprocess.run(["gh", "api", f"repos/{repository}/{path}"],
                                     check=True, capture_output=True).stdout)


def source_config(commit, path):
    return subprocess.run(["git", "show", f"{commit}:desktop-tauri/{path}"],
                          check=True, capture_output=True).stdout


def validate_run(run, repository, commit, run_id):
    if (run.get("id") != run_id or run.get("head_sha") != commit
            or run.get("head_repository", {}).get("full_name") != repository
            or run.get("status") != "completed" or run.get("conclusion") != "success"
            or run.get("path") != ".github/workflows/desktop-release.yml"):
        raise ValueError("Wrong original build identity or completion")


def select_artifact(response, commit, run_id, architecture):
    if response.get("total_count", 101) > 100:
        raise ValueError("Unexpected original artifact count")
    name = f"vibyra-rust-beta-macOS-{architecture}-{commit}"
    found = [item for item in response.get("artifacts", []) if item.get("name") == name]
    if len(found) != 1:
        raise ValueError("Exactly one original architecture artifact required")
    artifact = found[0]
    workflow = artifact.get("workflow_run", {})
    if (artifact.get("expired") or workflow.get("id") != run_id or workflow.get("head_sha") != commit
            or type(artifact.get("id")) is not int
            or not 0 < artifact.get("size_in_bytes", 0) <= 1024 ** 3
            or not re.fullmatch(r"sha256:[a-f0-9]{64}", artifact.get("digest", ""))):
        raise ValueError("Original artifact provenance/digest is invalid")
    return artifact


def extract_zip(package, destination, stem):
    expected = {stem, stem + ".sig", stem + ".sha256", stem + ".frontend.json"}
    with zipfile.ZipFile(package) as bundle:
        entries = bundle.infolist()
        if len(entries) != 4 or {item.filename for item in entries} != expected:
            raise ValueError("Unexpected original artifact contents")
        for item in entries:
            mode = (item.external_attr >> 16) & 0o170000
            limit = 1024 ** 3 if item.filename == stem else 1024 ** 2
            if mode not in [0, stat.S_IFREG] or not 0 < item.file_size <= limit:
                raise ValueError("Unsafe or oversized original artifact member")
            with bundle.open(item) as source, (destination / item.filename).open("xb") as output:
                while block := source.read(1024 * 1024):
                    output.write(block)


def fetch(repository, commit, run_id, architecture, destination, identity):
    validate_run(api(repository, f"actions/runs/{run_id}"), repository, commit, run_id)
    artifacts = api(repository, f"actions/runs/{run_id}/artifacts?per_page=100")
    artifact = select_artifact(artifacts, commit, run_id, architecture)
    package = destination / "original-ci.zip"
    with package.open("xb") as output:
        subprocess.run(["gh", "api", f"repos/{repository}/actions/artifacts/{artifact['id']}/zip"],
                       stdout=output, stderr=subprocess.PIPE, check=True)
    if package.stat().st_size != artifact["size_in_bytes"] or identity.digest(package) != artifact["digest"][7:]:
        raise ValueError("Original GitHub artifact ZIP digest differs")
    config_raw = source_config(commit, "src-tauri/tauri.conf.json")
    config = json.loads(config_raw)
    mac = json.loads(source_config(commit, "src-tauri/tauri.macos.conf.json"))
    version, build = config["version"], mac["bundle"]["macOS"]["bundleVersion"]
    stem = f"Vibyra-Desktop-{version}-macos-{architecture}.app.tar.gz"
    extract_zip(package, destination, stem)
    archive = destination / stem
    checksum = (destination / (stem + ".sha256")).read_text().strip()
    if not re.fullmatch(re.escape(identity.digest(archive)) + r"\s+(?:release/)?" + re.escape(stem), checksum):
        raise ValueError("Original staged archive digest differs")
    frontend = json.loads((destination / (stem + ".frontend.json")).read_text())
    lock = source_config(commit, "package-lock.json")
    if (frontend.get("revision") != commit or frontend.get("version") != version
            or frontend.get("lockSha256") != hashlib.sha256(lock).hexdigest()):
        raise ValueError("Original frontend is not from the frozen source")
    config_file = destination / "original-config.json"
    config_file.write_bytes(config_raw)
    identity.verify_signature(archive, destination / (stem + ".sig"), config_file)
    return archive, version, build
