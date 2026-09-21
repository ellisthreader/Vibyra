import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function requireReleaseIdentity(env = process.env) {
  if (!env.APPLE_SIGNING_IDENTITY?.startsWith("Developer ID Application:")) {
    throw new Error("Mac releases require APPLE_SIGNING_IDENTITY=Developer ID Application: … and its certificate/private key. Ad-hoc updates invalidate Screen Recording permission.");
  }
}

export function selectLocalIdentity(output) {
  const identities = [...output.matchAll(/"(Developer ID Application:[^"\n]+)"/g)].map((match) => match[1]);
  const unique = [...new Set(identities)];
  if (unique.length !== 1) throw new Error("Set APPLE_SIGNING_IDENTITY to your Developer ID Application certificate; exactly one usable identity could not be selected automatically.");
  return unique[0];
}

export function localSigningIdentity() {
  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Cannot inspect signing identities");
  return selectLocalIdentity(result.stdout);
}

export function validateSignatureDetails(details, allowAdHoc = false) {
  if (/^Signature=adhoc$/m.test(details) && allowAdHoc) return;
  if (!/^Authority=Developer ID Application:/m.test(details)
      || !/^TeamIdentifier=[A-Z0-9]{10}$/m.test(details)
      || !/^(?:# )?designated => .*anchor apple generic/m.test(details)
      || /^(?:# )?designated => .*cdhash/m.test(details)) {
    throw new Error("Vibyra requires a stable Developer ID Application signature to preserve macOS permissions. For disposable local builds only, pass --allow-ad-hoc (permissions may reset on every update).");
  }
}

function codesign(args) {
  const result = spawnSync("codesign", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "codesign failed");
  return `${result.stdout}\n${result.stderr}`;
}

export function verifyMacSignature(app, { allowAdHoc = false, previous } = {}) {
  codesign(["--verify", "--deep", "--strict", app]);
  const details = codesign(["--display", "--verbose=2", "--requirements", "-", app]);
  validateSignatureDetails(details, allowAdHoc);
  if (previous) {
    const old = codesign(["--display", "--verbose=2", "--requirements", "-", previous]);
    // An ad-hoc install needs a one-time migration. A signed install must retain
    // its actual designated requirement, not merely its display name or bundle ID.
    if (!/^Signature=adhoc$/m.test(old)) {
      const requirement = old.match(/^(?:# )?designated => (.+)$/m)?.[1];
      if (!requirement) throw new Error("Cannot determine the installed app's signing requirement.");
      codesign(["--verify", "--strict", "-R", `=${requirement}`, app]);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--check-env") requireReleaseIdentity();
  else if (process.argv[2]) verifyMacSignature(process.argv[2]);
  else throw new Error("Supply --check-env or an app bundle path.");
}
