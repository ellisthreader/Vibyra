#!/usr/bin/env python3
"""Exercise real native reads and an approved edit through isolated Agent tasks."""

import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
DESKTOP = ROOT / "desktop-tauri" / "src-tauri"


def free_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return server.getsockname()[1]


class Model(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        latest_user = next((str(item.get("content", "")).lower() for item in reversed(body.get("messages", []))
            if item.get("role") == "user"), "")
        git_task = "changed files" in latest_user
        edit_task = "write notes.txt" in latest_user
        tool_messages = [item for item in body.get("messages", []) if item.get("role") == "tool"]
        answered = bool(tool_messages)
        if answered:
            raw = tool_messages[-1].get("content")
            result = json.loads(raw) if isinstance(raw, str) else raw
            if edit_task:
                if result.get("written") is not True or result.get("path") != "notes.txt":
                    raise ValueError("The approved Mac edit did not return a matching receipt")
                answer = "Approved Mac note was written to notes.txt."
            elif git_task:
                files = result.get("files") if isinstance(result, dict) else None
                if not isinstance(files, list) or len(files) != 1:
                    raise ValueError("Git status did not return one visible file")
                answer = "Changed project file: " + files[0]["path"]
            else:
                content = result.get("content") if isinstance(result, dict) else None
                if not isinstance(content, str):
                    raise ValueError("The read tool did not return file content")
                answer = f"README.md contains: {content.strip()}"
        message = (
            {"role": "assistant", "content": answer}
            if answered
            else {"role": "assistant", "content": None, "tool_calls": [{"id": "smoke-edit-1" if edit_task else "smoke-read-1",
                "type": "function", "function": {"name": "write_file" if edit_task else ("git_status" if git_task else "read_file"),
                    "arguments": '{"path":"notes.txt","content":"Approved Mac note\\n","expectedSha256":"new"}' if edit_task
                        else ('{}' if git_task else '{"path":"README.md"}')}}]}
        )
        output = json.dumps({"id": "smoke-answer" if answered else "smoke-read",
            "usage": {"cost": 0.0002}, "choices": [{"message": message}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(output)))
        self.end_headers()
        self.wfile.write(output)

    def log_message(self, *_args):
        pass


def request(base, path, token=None, body=None):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(base + path, data=data, headers=headers), timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"{path}: HTTP {error.code} {error.read().decode()[:300]}") from error


def wait_for_backend(base, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("The isolated Laravel server exited early")
        try:
            request(base, "/api/vibes/models")
            return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("The isolated Laravel server did not start")


def main():
    with tempfile.TemporaryDirectory(prefix="vibyra-agent-computer-") as directory:
        tmp = Path(directory)
        database = tmp / "smoke.sqlite"
        database.touch()
        project = tmp / "project"
        project.mkdir()
        (project / "README.md").write_text("This sample project contains a safe everyday task.\n")
        (project / ".env.local").write_text("PRIVATE=fixture\n")
        subprocess.run(["git", "init", "--quiet"], cwd=project, check=True)
        model = ThreadingHTTPServer(("127.0.0.1", free_port()), Model)
        model_thread = threading.Thread(target=model.serve_forever, daemon=True)
        model_thread.start()
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        env = {**os.environ, "APP_ENV": "testing",
            "APP_KEY": "base64:eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=",
            "APP_CONFIG_CACHE": str(tmp / "config.php"), "APP_ROUTES_CACHE": str(tmp / "routes.php"),
            "DB_CONNECTION": "sqlite", "DB_DATABASE": str(database), "CACHE_STORE": "database",
            "CACHE_PREFIX": "agent-smoke-" + uuid.uuid4().hex + "-", "QUEUE_CONNECTION": "sync",
            "VIBES_QUEUE_CONNECTION": "sync", "VIBES_ENABLED": "true", "AGENTS_ENABLED": "true",
            "AGENTS_LOCAL_RUNNER_ENABLED": "true", "OPENROUTER_API_KEY": "fixture-only",
            "OPENROUTER_API_URL": f"http://127.0.0.1:{model.server_port}/chat/completions"}
        subprocess.run(["php", "artisan", "migrate", "--force"], cwd=BACKEND,
            env=env, check=True, stdout=subprocess.DEVNULL)
        seed = ('require "vendor/autoload.php"; $app = require "bootstrap/app.php"; '
            '$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); '
            'Tests\\Support\\VibesCatalogue::put();')
        subprocess.run(["php", "-r", seed], cwd=BACKEND, env=env, check=True)
        log = (tmp / "backend.log").open("w")
        backend = subprocess.Popen(["php", "artisan", "serve", "--host=127.0.0.1",
            f"--port={port}"], cwd=BACKEND, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            wait_for_backend(base, backend)
            email = f"smoke-{uuid.uuid4().hex}@example.test"
            signed = request(base, "/api/auth/signup", body={"name": "Agent Smoke",
                "email": email, "password": "Fixture-only-password-2026!",
                "deviceName": "Isolated Agent Computer test"})
            token = signed["token"]
            request(base, "/api/vibes/consent", token, {"accepted": True})
            fund = ('require "vendor/autoload.php"; $app = require "bootstrap/app.php"; '
                '$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); '
                '$user = App\\Models\\User::where("email", getenv("SMOKE_EMAIL"))->firstOrFail(); '
                '$user->forceFill(["email_verified_at" => now()])->save(); '
                'app(App\\Services\\Vibes\\Wallet::class)->grant($user->id, "agent-smoke", "topup", 500);')
            subprocess.run(["php", "-r", fund], cwd=BACKEND,
                env={**env, "SMOKE_EMAIL": email}, check=True)
            agent = request(base, "/api/agents/v1/teammates", token, {
                "id": str(uuid.uuid4()), "name": "Mac Reader", "brief": "Read the sample project.",
                "memory": "", "avatar": "assistant", "budget": 50, "integrations": []})["teammate"]
            grant = request(base, "/api/agents/v1/workspaces", token, {
                "agentId": agent["id"], "hostId": "b" * 64, "label": "Smoke project"})["workspace"]
            quote = request(base, "/api/vibes/quote", token, {"chatId": agent["chatId"],
                "text": "Read README.md in the granted Mac folder and tell me what it contains.",
                "model": "auto"})
            turn_id = str(uuid.uuid4())
            request(base, "/api/vibes/turns", token, {"id": turn_id, "quote": quote["quote"]})
            waiting = request(base, f"/api/vibes/turns/{turn_id}", token)["turn"]
            assert waiting["status"] == "waiting" and waiting["tools"][0]["operation"] == "read_file"
            files = {"TOKEN_FILE": token, "KEY_FILE": grant["runnerKey"],
                "WORKSPACE_FILE": grant["id"]}
            rust_env = {**os.environ, "VIBYRA_DESKTOP_API_URL": base,
                "VIBYRA_AGENT_SMOKE_PROJECT": str(project)}
            for suffix, value in files.items():
                file = tmp / suffix.lower()
                file.write_text(value)
                file.chmod(0o600)
                rust_env["VIBYRA_AGENT_SMOKE_" + suffix] = str(file)
            subprocess.run(["cargo", "test", "--lib",
                "agent_computer_transport::tests::local_backend_and_real_mac_read_complete_one_everyday_task",
                "--", "--ignored", "--nocapture"], cwd=DESKTOP, env=rust_env, check=True,
                timeout=600)
            finished = request(base, f"/api/vibes/turns/{turn_id}", token)["turn"]
            assert finished["status"] == "completed", finished
            assert finished["tools"][0]["decision"] == "allow"
            assert finished["response"] == "README.md contains: This sample project contains a safe everyday task."
            git_quote = request(base, "/api/vibes/quote", token, {"chatId": agent["chatId"],
                "text": "List changed files in the granted Mac Git repository.", "model": "auto"})
            git_turn = str(uuid.uuid4())
            request(base, "/api/vibes/turns", token, {"id": git_turn, "quote": git_quote["quote"]})
            waiting = request(base, f"/api/vibes/turns/{git_turn}", token)["turn"]
            assert waiting["status"] == "waiting" and waiting["tools"][0]["operation"] == "git_status"
            subprocess.run(["cargo", "test", "--lib",
                "agent_computer_transport::tests::local_backend_and_real_mac_read_complete_one_everyday_task",
                "--", "--ignored", "--nocapture"], cwd=DESKTOP,
                env={**rust_env, "VIBYRA_AGENT_SMOKE_OPERATION": "git_status"}, check=True, timeout=600)
            finished = request(base, f"/api/vibes/turns/{git_turn}", token)["turn"]
            assert finished["status"] == "completed", finished
            assert finished["response"] == "Changed project file: README.md"
            editor = request(base, "/api/agents/v1/teammates", token, {
                "id": str(uuid.uuid4()), "name": "Mac Editor", "brief": "Edit a safe file with approval.",
                "memory": "", "avatar": "assistant", "budget": 50, "integrations": []})["teammate"]
            edit_grant = request(base, "/api/agents/v1/workspaces", token, {
                "agentId": editor["id"], "hostId": "b" * 64, "label": "Smoke project", "canWrite": True})["workspace"]
            assert edit_grant["canWrite"] is True
            edit_quote = request(base, "/api/vibes/quote", token, {"chatId": editor["chatId"],
                "text": "Write notes.txt in the granted Mac folder after my approval.", "model": "auto"})
            edit_turn = str(uuid.uuid4())
            request(base, "/api/vibes/turns", token, {"id": edit_turn, "quote": edit_quote["quote"]})
            waiting = request(base, f"/api/vibes/turns/{edit_turn}", token)["turn"]
            assert waiting["status"] == "waiting" and waiting["tools"][0]["operation"] == "write_file"
            approval = waiting["tools"][0]["approval"]
            assert approval["state"] == "pending"
            request(base, f"/api/agents/v1/decisions/{waiting['tools'][0]['id']}", token,
                {"fingerprint": approval["fingerprint"], "decision": "allow"})
            for suffix, value in {"KEY_FILE": edit_grant["runnerKey"],
                "WORKSPACE_FILE": edit_grant["id"]}.items():
                (tmp / suffix.lower()).write_text(value)
            subprocess.run(["cargo", "test", "--lib",
                "agent_computer_transport::tests::local_backend_approval_and_real_mac_write_complete_one_everyday_task",
                "--", "--ignored", "--nocapture"], cwd=DESKTOP, env=rust_env, check=True, timeout=600)
            finished = request(base, f"/api/vibes/turns/{edit_turn}", token)["turn"]
            assert finished["status"] == "completed", finished
            assert finished["response"] == "Approved Mac note was written to notes.txt."
            assert (project / "notes.txt").read_text() == "Approved Mac note\n"
            print("Agent Computer acceptance passed: native reads, exact approved edit, durable receipts, completed answers")
        finally:
            backend.terminate()
            try:
                backend.wait(timeout=5)
            except subprocess.TimeoutExpired:
                backend.kill()
            log.close()
            model.shutdown()
            model.server_close()


if __name__ == "__main__":
    main()
