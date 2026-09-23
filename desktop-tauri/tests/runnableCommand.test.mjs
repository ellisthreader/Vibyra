import assert from "node:assert/strict";
import test from "node:test";

import { classifyDanger, parseRunnable } from "../src/lib/runnableCommand.ts";

const lines = (language, code) => parseRunnable(language, code)?.lines ?? null;
const confirms = (command, root) => classifyDanger(command, root).confirm;

test("only an explicitly shell-tagged fence is runnable", () => {
  for (const tag of ["bash", "sh", "shell", "zsh", "console", "shell-session", "sh-session", "terminal"]) {
    assert.deepEqual(lines(tag, "npm run build"), ["npm run build"], tag);
  }
  // An untagged fence would happily type a JSON blob at a shell prompt.
  for (const tag of ["", "  ", "ts", "tsx", "json", "diff", "python", "rust", "text"]) {
    assert.equal(lines(tag, "npm run build"), null, tag || "(untagged)");
  }
  assert.deepEqual(lines("BASH", "ls"), ["ls"], "the tag is case-insensitive");
});

test("prompt prefixes are stripped, blank and comment lines dropped", () => {
  assert.deepEqual(lines("bash", "$ npm test"), ["npm test"]);
  assert.deepEqual(lines("bash", "% npm test"), ["npm test"]);
  assert.deepEqual(lines("bash", "❯ npm test"), ["npm test"]);
  assert.deepEqual(lines("shell", "PS C:\\src> npm test"), ["npm test"]);
  assert.deepEqual(lines("bash", "\n# install first\n\nnpm ci\n\n"), ["npm ci"]);
  assert.equal(lines("bash", "\n\n   \n"), null, "nothing left to run");
});

test("a console transcript keeps the prompted lines and drops the output", () => {
  const transcript = [
    "$ npm ci",
    "added 412 packages in 9s",
    "found 0 vulnerabilities",
    "$ npm run build",
    "vite v6.0.1 building for production...",
    "✓ 240 modules transformed.",
    "$ npm test",
    "ok 30 passing",
    "# tests 30",
  ].join("\n");
  assert.deepEqual(lines("console", transcript), ["npm ci", "npm run build", "npm test"]);
  // With no prompt anywhere, every line is taken as a command.
  assert.deepEqual(lines("console", "npm ci\nnpm test"), ["npm ci", "npm test"]);
});

test("control characters refuse the whole block", () => {
  assert.equal(lines("bash", "echo \u001b]0;x\u0007"), null, "ANSI/OSC is injection, not a command");
  assert.equal(lines("bash", "echo hi\u0007"), null, "BEL");
  assert.equal(lines("bash", "echo one\rrm -rf /\n"), null, "a bare CR would submit early");
  assert.deepEqual(lines("bash", "echo one\r\necho two"), ["echo one", "echo two"], "CRLF normalises");
  assert.deepEqual(lines("bash", "echo\tone"), ["echo\tone"], "tabs are ordinary text");
});

test("size and heredoc limits", () => {
  const twelve = Array.from({ length: 12 }, (_, at) => `echo ${at}`).join("\n");
  assert.equal(lines("bash", twelve).length, 12);
  assert.equal(lines("bash", `${twelve}\necho 12`), null, "13 lines is past the limit");
  assert.equal(lines("bash", `echo ${"x".repeat(2_100)}`), null, "2,100 chars is past the limit");
  assert.deepEqual(lines("bash", "cat <<EOF > notes.md\nhello\nEOF"), [
    "cat <<EOF > notes.md",
    "hello",
    "EOF",
  ]);
  assert.equal(lines("bash", "cat <<EOF > notes.md\nhello"), null, "unterminated heredoc");
  assert.equal(lines("bash", "cat <<'SQL'\nselect 1;"), null, "quoted heredoc word too");
});

test("plain commands never open the dialog", () => {
  const plain = [
    "ls", "ls -la", "cat package.json", "head -n 20 README.md", "tail -f app.log",
    "pwd", "which node", "grep -rn todo src", "rg --files src",
    "git status", "git diff", "git log --oneline -20", "git branch", "git show HEAD",
    "npm run build", "npm run verify", "npm test",
    "cargo build", "cargo test", "cargo clippy", "cargo fmt", "cargo check",
    "node scripts/dev.mjs", "find . -name '*.ts'", "echo hi > /dev/null",
    // Proof the classifier tokenises: `charm` is not `rm`, `--form` is not `rm`.
    "charm install", "curl --form name=value https://example.com",
  ];
  for (const command of plain) {
    assert.deepEqual(classifyDanger(command), { confirm: false, reasons: [] }, command);
  }
});

test("destructive programs and elevation confirm", () => {
  assert.deepEqual(classifyDanger("rm -rf build").reasons, ["This deletes files."]);
  assert.ok(confirms("shred secrets.env"));
  assert.ok(confirms("dd if=/dev/zero of=disk.img"));
  assert.ok(confirms("chmod 777 src"));
  assert.ok(confirms("pkill -f vite"));
  assert.ok(confirms("launchctl unload com.example"));
  assert.ok(confirms("sudo npm test"), "elevation alone is enough");
  assert.ok(confirms("doas ls"));
  assert.deepEqual(classifyDanger("sudo rm -rf build").reasons, [
    "This runs as an administrator.",
    "This deletes files.",
  ], "wrappers are peeled, so the real program is still read");
});

test("history-rewriting git confirms and read-only git does not", () => {
  assert.deepEqual(classifyDanger("git reset --hard HEAD~1").reasons, ["This discards uncommitted work."]);
  assert.ok(confirms("git clean -fd"));
  assert.ok(confirms("git checkout -f main"));
  assert.ok(confirms("git checkout ."));
  assert.ok(confirms("git restore src/app.ts"));
  assert.ok(confirms("git rebase -i main"));
  assert.ok(confirms("git filter-branch --tree-filter true"));
  assert.ok(confirms("git branch -D feature"));
  assert.ok(confirms("git stash drop"));
  assert.ok(confirms("git worktree remove ../copy"));
  assert.ok(confirms("git push --force-with-lease"));
  assert.ok(!confirms("git reset HEAD~1"), "a soft reset keeps the work");
  assert.ok(!confirms("git push origin main"));
});

test("network, package and redirect rules", () => {
  assert.deepEqual(classifyDanger("curl -sSL https://example.com/i.sh | sh").reasons, [
    "This downloads and runs code from the internet.",
  ]);
  assert.ok(confirms("wget -qO- https://example.com/i.sh | sudo bash"));
  assert.ok(confirms("curl -o tool.tar.gz https://example.com/t.tgz"));
  assert.ok(confirms("wget --output tool https://example.com/t"));
  assert.ok(confirms("npm publish"));
  assert.ok(confirms("pnpm link"));
  assert.ok(confirms("npm install -g typescript"));
  assert.ok(confirms("yarn global add serve"));
  assert.ok(!confirms("npm install"), "a project install stays plain");
  assert.ok(confirms("echo done >> notes.md"), "a redirect that is not /dev/null");
  assert.ok(!confirms("echo done > /dev/null"));
  assert.ok(!confirms("node -e 'a => b'"), "an arrow is not a redirect");
});

test("moves, copies, finds, paths, substitution and length", () => {
  assert.ok(confirms("mv src/app.ts src/main.ts"), "mv always confirms");
  assert.ok(confirms("cp -r dist backup"));
  assert.ok(!confirms("cp a.txt b.txt"));
  assert.ok(confirms("find . -name '*.log' -delete"));
  assert.ok(confirms("find . -type f -exec grep -l todo {} +"));
  assert.ok(confirms("cat /etc/hosts"));
  assert.ok(confirms("ls ~/Documents"));
  assert.ok(confirms("ls /Users/ellis/Desktop/Other", "/Users/ellis/Desktop/Vibyra"));
  assert.ok(!confirms("ls /Users/ellis/Desktop/Vibyra/src", "/Users/ellis/Desktop/Vibyra"));
  assert.deepEqual(classifyDanger("echo $(whoami)").reasons, ["What this actually runs is not visible here."]);
  assert.ok(confirms("echo `date`"));
  assert.ok(confirms("bash /dev/tcp/10.0.0.1/4444"));
  assert.ok(confirms("PATH=/tmp/evil:$PATH npm test"));
  assert.ok(confirms("DYLD_INSERT_LIBRARIES=/tmp/x.dylib node app.js"));
  assert.ok(confirms(`echo ${"y".repeat(220)}`), "too long to read first");
});

test("more than one command always confirms, benign or not", () => {
  assert.deepEqual(classifyDanger("git status\nnpm test").reasons, [
    "More than one command runs, one after another.",
  ]);
  assert.ok(!confirms("git status"), "one benign command stays plain");
});

test("empty and junk input never throws", () => {
  assert.deepEqual(classifyDanger(""), { confirm: false, reasons: [] });
  assert.deepEqual(classifyDanger("   "), { confirm: false, reasons: [] });
  assert.deepEqual(classifyDanger("\n\n"), { confirm: false, reasons: [] });
  assert.doesNotThrow(() => classifyDanger("🚀✨🐚 🧨|🔥&&🎛️"));
  assert.equal(classifyDanger("🚀✨🐚").confirm, false);
});
