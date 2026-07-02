import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

// Well-known broad Windows principals that must never hold an ACE on a
// secret file: Everyone, BUILTIN\Users, and Authenticated Users.
const BROAD_WINDOWS_SIDS = ["*S-1-1-0", "*S-1-5-32-545", "*S-1-5-11"];

/**
 * Asserts that a persisted secret file is readable by the owning user only.
 *
 * POSIX: the file must carry literal 0600 permission bits.
 * Windows: POSIX mode bits are not representable (fs.stat always reports
 * 0o666 for writable files and chmod can only toggle read-only), so the
 * equivalent contract is enforced through NTFS ACLs. Vibyra stores these
 * files under the user profile, whose inherited ACL grants access to the
 * owner, SYSTEM, and Administrators only. We assert that no broad group
 * (Everyone, BUILTIN\Users, Authenticated Users) appears in the file's ACL.
 */
export async function assertOwnerOnlySecretFile(filePath) {
  if (process.platform !== "win32") {
    assert.equal((await stat(filePath)).mode & 0o777, 0o600,
      `secret file ${filePath} must be persisted with mode 0600`);
    return;
  }
  for (const sid of BROAD_WINDOWS_SIDS) {
    const { stdout } = await run("icacls", [filePath, "/findsid", sid], { encoding: "utf8" });
    assert.match(stdout, /No files with a matching SID was found/i,
      `secret file ${filePath} must not be accessible to broad Windows group ${sid}`);
  }
}
