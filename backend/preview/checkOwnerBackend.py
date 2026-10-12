"""Run owner account and affected authorization regressions in isolated PHP processes."""
import base64
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
selected = re.compile(
    r"^(Owner|LocalOwnerAccess|WebsiteOwnerTwoFactor|TwoFactor|VibyraSessionLifecycle|"
    r"RemoteAccountAtomicity|RemoteSessionSecurity|PlatformApiKeys|MembershipWallet|"
    r"AgentToolApprovalFlow|AgentV2(?:ComputerPublish|StrandedApproval|Approval|Tools))"
)
files = [root / "tests/integration/OwnerAccountPostgresTest.php"] if "--postgres" in sys.argv else sorted(
    p for p in (root / "tests/Feature").rglob("*Test.php")
    if selected.match(p.name) or p.parent.name == "CloudWorkspaces"
    or (p.parent.name == "CloudComputer" and p.name.startswith("Sync"))
)
env = os.environ.copy()
env["APP_KEY"] = "base64:" + base64.b64encode(secrets.token_bytes(32)).decode()
failed = []
for path in files:
    result = subprocess.run(["php", "-d", "memory_limit=1G", "vendor/bin/phpunit", "--colors=never", str(path)],
                            cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    name = str(path.relative_to(root))
    summaries = [line for line in result.stdout.splitlines() if line.startswith(("OK (", "Tests:"))]
    print(name + ": " + (summaries[-1] if summaries else "No test summary"), flush=True)
    if result.returncode != 0 or not summaries or "Skipped" in summaries[-1]:
        failed.append(name)
        print(result.stdout, flush=True)
print(f"Files: {len(files)}; passed: {len(files) - len(failed)}; failed: {len(failed)}", flush=True)
sys.exit(bool(failed) or not files)
