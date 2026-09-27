#!/usr/bin/env python3
"""Isolated backend and model for a native Mac folder picker and edit approval check."""

import base64
import os
import runpy
import socket
import subprocess
import tempfile
import threading
import time
import uuid
from http.server import ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
smoke = runpy.run_path(str(Path(__file__).with_name("verify-agent-computer.py")))
Model = smoke["Model"]
request = smoke["request"]
wait_for_backend = smoke["wait_for_backend"]


def free_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return server.getsockname()[1]


def main():
    with tempfile.TemporaryDirectory(prefix="vibyra-agent-native-edit-") as directory:
        tmp = Path(directory)
        database = tmp / "fixture.sqlite"
        database.touch()
        project = tmp / "project"
        project.mkdir()
        (project / "README.md").write_text("A small project for an approved Mac edit.\n")
        subprocess.run(["git", "init", "--quiet"], cwd=project, check=True)
        model = ThreadingHTTPServer(("127.0.0.1", free_port()), Model)
        threading.Thread(target=model.serve_forever, daemon=True).start()
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        env = {**os.environ, "APP_ENV": "testing",
            "APP_KEY": "base64:" + base64.b64encode(b"x" * 32).decode(),
            "APP_CONFIG_CACHE": str(tmp / "config.php"), "APP_ROUTES_CACHE": str(tmp / "routes.php"),
            "DB_CONNECTION": "sqlite", "DB_DATABASE": str(database), "CACHE_STORE": "database",
            "CACHE_PREFIX": "agent-native-" + uuid.uuid4().hex + "-", "QUEUE_CONNECTION": "sync",
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
            email = f"native-edit-{uuid.uuid4().hex}@example.test"
            password = "Fixture-only-password-2026!"
            signed = request(base, "/api/auth/signup", body={"name": "Native Edit Fixture",
                "email": email, "password": password, "deviceName": "Isolated Mac fixture"})
            token = signed["token"]
            request(base, "/api/vibes/consent", token, {"accepted": True})
            fund = ('require "vendor/autoload.php"; $app = require "bootstrap/app.php"; '
                '$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); '
                '$user = App\\Models\\User::where("email", getenv("SMOKE_EMAIL"))->firstOrFail(); '
                '$user->forceFill(["email_verified_at" => now()])->save(); '
                'app(App\\Services\\Vibes\\Wallet::class)->grant($user->id, "native-edit", "topup", 500);')
            subprocess.run(["php", "-r", fund], cwd=BACKEND,
                env={**env, "SMOKE_EMAIL": email}, check=True)
            agent = request(base, "/api/agents/v1/teammates", token, {
                "id": str(uuid.uuid4()), "name": "Mac Editor", "brief": "Edit one file with approval.",
                "memory": "", "avatar": "assistant", "budget": 50, "integrations": []})["teammate"]
            print(f"BASE={base}\nEMAIL={email}\nPASSWORD={password}\nPROJECT={project}\nAGENT={agent['name']}", flush=True)
            print("Choose this project in Agent Computer with edits enabled.", flush=True)
            for _ in range(600):
                grants = request(base, "/api/agents/v1/workspaces", token)["workspaces"]
                if any(item["agentId"] == agent["id"] and item["canWrite"] for item in grants):
                    break
                time.sleep(1)
            else:
                raise TimeoutError("No edit-enabled Mac folder grant appeared")
            quote = request(base, "/api/vibes/quote", token, {"chatId": agent["chatId"],
                "text": "Write notes.txt in the granted Mac folder after my approval.", "model": "auto"})
            turn_id = str(uuid.uuid4())
            request(base, "/api/vibes/turns", token, {"id": turn_id, "quote": quote["quote"]})
            waiting = request(base, f"/api/vibes/turns/{turn_id}", token)["turn"]
            assert waiting["status"] == "waiting" and waiting["tools"][0]["approval"]["state"] == "pending"
            print(f"APPROVAL_READY={turn_id} — approve once in the native Mac conversation.", flush=True)
            for _ in range(600):
                turn = request(base, f"/api/vibes/turns/{turn_id}", token)["turn"]
                if turn["status"] in ("completed", "failed", "cancelled"):
                    break
                time.sleep(1)
            else:
                raise TimeoutError("Native approved edit did not finish")
            assert turn["status"] == "completed", turn
            assert turn["response"] == "Approved Mac note was written to notes.txt.", turn
            assert (project / "notes.txt").read_text() == "Approved Mac note\n"
            print("PASS native edit grant, approval, Mac write, receipt and final answer", flush=True)
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
