#!/usr/bin/env python3
"""Run inert native Tauri IPC attacks without opening installed Vibyra or accounts."""
from pathlib import Path
import subprocess
import sys
import os

root = Path(__file__).resolve().parents[1] / "src-tauri"
# Force a hostile verbose environment; the application policy must ignore it.
process = subprocess.Popen(["cargo", "run", "--locked", "--example", "remote-ipc-boundary"],
    cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    env={**os.environ, "RUST_LOG": "trace,tauri=trace,tauri::webview=trace"})
markers = set()
leaked = False
for line in process.stdout:
    if "__TAURI_INVOKE_KEY__" in line:
        leaked = True
        continue
    if line.startswith("IPC_"):
        print(line.rstrip(), flush=True)
        markers.add(line.split()[0:2][0] + " " + line.split()[1])
    elif line.startswith(("error", "warning", "   Compiling", "    Finished", "     Running")):
        print(line.rstrip(), flush=True)
status = process.wait()
if leaked:
    print("FAIL: native framework emitted an invoke key diagnostic (value withheld).")
if leaked or status or not {"IPC_BOUNDARY PASS", "IPC_ACL PASS"}.issubset(markers):
    sys.exit(status or 1)
