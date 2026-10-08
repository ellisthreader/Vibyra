"""Exercise the actual hidden-input helper against a local Railway/curl fixture."""
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import tempfile
import termios
import time


HELPER = Path(__file__).resolve().parents[2] / "scripts/set-connector-credentials.sh"
PROJECT = "4e292f83-b6e3-4556-a1db-69a39a2be3b2"
ENVIRONMENT = "8d678e46-a6f9-43a7-b192-3da614d82471"
SERVICE = "17d27bf4-6506-4545-93e3-221065d921b0"


def run_case(provider, redeploy):
    with tempfile.TemporaryDirectory(prefix="vibyra-credential-helper-") as directory:
        root = Path(directory)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        railway = bin_dir / "railway"
        railway.write_text("""#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
for flag, value in [('--project', os.environ['QA_PROJECT']), ('--environment', os.environ['QA_ENVIRONMENT'])]:
    assert flag in args and args[args.index(flag) + 1] == value
if args[0] != 'status':
    assert args[args.index('--service') + 1] == os.environ['QA_SERVICE']
call = {'args': args}
if args[:2] == ['variable', 'set']:
    assert '--stdin' in args and '--skip-deploys' in args
    call['value'] = sys.stdin.read()
with open(os.environ['QA_CALLS'], 'a') as stream:
    stream.write(json.dumps(call) + '\\n')
if args[0] == 'status':
    print('Project: Vibyra QA Project\\nEnvironment: production')
elif args[:2] == ['variable', 'list']:
    print(json.dumps({'EXISTING_TEST_KEY': 'fixture-existing-secret'}))
elif args[:2] != ['variable', 'set'] and args[0] != 'redeploy':
    raise SystemExit(9)
""")
        curl = bin_dir / "curl"
        curl.write_text("""#!/usr/bin/env python3
import json, os
from pathlib import Path
p = Path(os.environ['QA_CURL_COUNT'])
count = int(p.read_text()) + 1 if p.exists() else 1
p.write_text(str(count))
if count == 1:
    print('<html>PHP router error with HTTP 200</html>')
else:
    print(json.dumps({'enabled': True, 'integrations': [{'id': slug, 'credential': {'configured': True}} for slug in ['slack', 'outlook_mail', 'outlook_calendar', 'onedrive', 'teams', 'sharepoint']]}))
""")
        sleep = bin_dir / "sleep"
        sleep.write_text("#!/bin/sh\nexit 0\n")
        for executable in [railway, curl, sleep]:
            executable.chmod(0o755)
        calls = root / "calls.jsonl"
        curl_count = root / "curl-count"
        env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}",
                   QA_PROJECT=PROJECT, QA_ENVIRONMENT=ENVIRONMENT,
                   QA_SERVICE=SERVICE, QA_CALLS=str(calls), QA_CURL_COUNT=str(curl_count))
        for override in ["CONNECTOR_PROJECT_ID", "CONNECTOR_ENVIRONMENT_ID", "CONNECTOR_SERVICE_ID"]:
            env.pop(override, None)
        prompts = [("Type the environment name (production)", "production")]
        values = {}
        for label in ["Slack", "Notion", "Linear", "Microsoft", "Stripe"]:
            prompts.append((f"Set up {label}?", "y" if label == provider else "n"))
            if label != provider:
                continue
            identifier = "12345678-1234-1234-1234-123456789abc" if label == "Microsoft" else "1234.5678"
            secret = "fixture-client-secret-value"
            prompts.extend([(f"{label} Client ID", identifier), (f"{label} Client Secret", secret)])
            values[f"CHAT_CONNECTORS_{label.upper()}_CLIENT_ID"] = identifier
            values[f"CHAT_CONNECTORS_{label.upper()}_CLIENT_SECRET"] = secret
            if label == "Slack":
                prompts.append(("Slack Signing Secret", ""))
        prompts.extend([("Write these now?", "y"), (f"Redeploy {SERVICE} now?", "y" if redeploy else "n")])
        master, slave = pty.openpty()
        process = subprocess.Popen(["bash", str(HELPER)], stdin=slave, stdout=slave, stderr=slave, env=env)
        os.close(slave)
        output, cursor, prompt_index = "", 0, 0
        deadline = time.monotonic() + 25
        try:
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.1)[0]:
                    try:
                        chunk = os.read(master, 65536).decode()
                    except OSError:
                        break
                    if not chunk:
                        break
                    output += chunk
                if prompt_index < len(prompts):
                    marker, answer = prompts[prompt_index]
                    location = output.find(marker, cursor)
                    hidden = any(part in marker for part in ["Client ID", "Client Secret", "Signing Secret"])
                    echo_disabled = not (termios.tcgetattr(master)[3] & termios.ECHO)
                    if location >= 0 and (not hidden or echo_disabled):
                        os.write(master, (answer + "\n").encode())
                        cursor = location + len(marker)
                        prompt_index += 1
                elif process.poll() is not None:
                    break
            assert process.wait(timeout=3) == 0, "helper did not complete"
            assert prompt_index == len(prompts), "helper stopped before all prompts"
            assert "fixture-client-secret-value" not in output, "secret was echoed"
            assert "fixture-existing-secret" not in output, "existing secret was printed"
            records = [json.loads(line) for line in calls.read_text().splitlines()]
            writes = {r["args"][2]: r["value"] for r in records if r["args"][:2] == ["variable", "set"]}
            assert writes == values, "wrong credential values or variable names"
            assert all("fixture-client-secret-value" not in str(r["args"]) for r in records), "secret passed in argv"
            if redeploy:
                assert int(curl_count.read_text()) == 3, "HTTP 200 HTML was accepted as health"
                assert any(r["args"][0] == "redeploy" for r in records)
            print(f"PASS {provider}: hidden input, explicit target, exact stdin writes" + (", typed JSON readiness" if redeploy else ""))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            os.close(master)


if __name__ == "__main__":
    run_case("Microsoft", True)
    run_case("Slack", False)
