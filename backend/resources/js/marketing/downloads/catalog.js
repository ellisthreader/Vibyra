export const PUBLIC_DOWNLOAD_ORIGIN = "https://vibyra-production.up.railway.app";
export const PLATFORMS = ["windows", "linux", "linux-deb", "macos-arm64", "macos-x64"];
const extensions = {
    windows: ".exe",
    linux: ".appimage",
    "linux-deb": ".deb",
    "macos-arm64": ".dmg",
    "macos-x64": ".dmg",
};

export function available(release) {
    return (
        release?.available === true &&
        PLATFORMS.includes(release.platform) &&
        typeof release.version === "string" &&
        release.version.trim().length > 0 &&
        typeof release.filename === "string" &&
        release.filename.toLowerCase().endsWith(extensions[release.platform]) &&
        Number.isFinite(release.sizeBytes) &&
        release.sizeBytes > 0 &&
        /^[a-f0-9]{64}$/i.test(release.sha256 ?? "")
    );
}

export function parseCatalog(payload) {
    if (payload?.ok !== true || !Array.isArray(payload.releases))
        throw new Error("Invalid release catalogue");
    const base = payload.downloadBaseUrl ?? "";
    if (base !== "" && base !== PUBLIC_DOWNLOAD_ORIGIN) throw new Error("Invalid download origin");
    const all = payload.releases.flatMap((release) =>
        release?.platform === "macos" ? (Array.isArray(release.variants) ? release.variants : []) : [release],
    );
    const releases = all.filter((release) => PLATFORMS.includes(release?.platform));
    if (!releases.length) throw new Error("Empty release catalogue");
    if (new Set(releases.map((release) => release.platform)).size !== releases.length) {
        throw new Error("Duplicate release platforms");
    }
    const versions = releases.filter(available).map((release) => release.version);
    return {
        releases: Object.fromEntries(releases.map((release) => [release.platform, release])),
        base,
        latest: versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) ?? "",
    };
}

export function fileUrl(catalog, platform) {
    return PLATFORMS.includes(platform) && available(catalog?.releases[platform])
        ? `${catalog.base}/downloads/${platform}`
        : null;
}

export function installCommand(release, kind) {
    if (!available(release)) return null;
    const name = release.filename;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(name)) return null;
    return kind === "linux-deb"
        ? `sudo apt install ~/Downloads/'${name}'`
        : `cd ~/Downloads\nchmod +x '${name}'\n./'${name}'`;
}
