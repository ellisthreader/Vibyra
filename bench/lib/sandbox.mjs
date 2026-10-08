import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

// Model-written code runs here: its own temp folder, no network, no writes
// elsewhere (macOS sandbox-exec), a hard timeout. On Linux, run the whole
// harness inside a throwaway container instead (see PLAN.md).
const PROFILE = `(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write* (subpath (param "WORK")) (literal "/dev/null"))`;

export const PYTHON = process.env.BENCH_PYTHON
    || (platform() === "darwin" ? "/Library/Developer/CommandLineTools/usr/bin/python3" : "python3");

export async function runPython(files, entry, { timeoutMs = 20000 } = {}) {
    const work = await realpath(await mkdtemp(join(tmpdir(), "vibyra-bench-")));
    try {
        for (const [name, content] of Object.entries(files)) await writeFile(join(work, name), content);
        const sandboxed = platform() === "darwin";
        if (sandboxed) await writeFile(join(work, ".profile.sb"), PROFILE);
        const cmd = sandboxed ? "sandbox-exec" : PYTHON;
        const args = sandboxed ? ["-f", join(work, ".profile.sb"), "-D", `WORK=${work}`, PYTHON, entry] : [entry];
        return await new Promise((resolve) => {
            const child = spawn(cmd, args, { cwd: work, env: { PATH: "/usr/bin:/bin", HOME: work } });
            let out = "";
            child.stdout.on("data", (d) => { out += d; });
            child.stderr.on("data", (d) => { out += d; });
            const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
            child.on("close", (code, signal) => {
                clearTimeout(timer);
                resolve({ ok: code === 0, code, timedOut: signal === "SIGKILL", output: out.slice(-4000) });
            });
        });
    } finally {
        await rm(work, { recursive: true, force: true });
    }
}
