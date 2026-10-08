#!/usr/bin/env python3
"""Real native event/eval dispatch regression in an inert, hidden QA webview."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1] / "src-tauri"
process = subprocess.Popen(
    ["cargo", "run", "--locked", "--example", "event-dispatch"], cwd=root,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    env={**os.environ, "RUST_LOG": "trace,tauri=trace"},
)
passed = False
leaked = False
for line in process.stdout:
    if "__TAURI_INVOKE_KEY__" in line:
        leaked = True
    elif line.startswith("EVENT_DISPATCH"):
        print(line.rstrip(), flush=True)
        passed = line.startswith("EVENT_DISPATCH PASS ")
    elif line.startswith(("error", "warning", "   Compiling", "    Finished", "     Running")):
        print(line.rstrip(), flush=True)
status = process.wait()
if leaked:
    print("FAIL: native framework emitted an invoke key diagnostic (value withheld).")
if status or leaked or not passed:
    sys.exit(status or 1)
