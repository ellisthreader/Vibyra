import assert from "node:assert/strict";
import test from "node:test";
import { available, fileUrl, installCommand, parseCatalog, PUBLIC_DOWNLOAD_ORIGIN } from "./catalog.js";

const windows = { platform: "windows", available: true, version: "0.4.3", filename: "Vibyra.exe", sizeBytes: 8192, sha256: "a".repeat(64) };

test("only complete, available packages enable downloads", () => {
    assert.equal(available(windows), true);
    for (const patch of [{ available: false }, { available: "true" }, { sizeBytes: 0 }, { version: "" }, { sha256: "invalid" }, { filename: "archive.zip" }]) {
        const catalog = parseCatalog({ ok: true, releases: [{ ...windows, ...patch }] });
        assert.equal(fileUrl(catalog, "windows"), null);
        assert.equal(catalog.latest, "");
    }
});

test("download URLs use known platform routes and the approved origin", () => {
    const release = { ...windows, downloadUrl: "https://unexpected.example/file.exe" };
    assert.equal(fileUrl(parseCatalog({ ok: true, releases: [release] }), "windows"), "/downloads/windows");
    const publicCatalog = parseCatalog({ ok: true, releases: [release], downloadBaseUrl: PUBLIC_DOWNLOAD_ORIGIN });
    assert.equal(fileUrl(publicCatalog, "windows"), `${PUBLIC_DOWNLOAD_ORIGIN}/downloads/windows`);
    assert.equal(fileUrl(publicCatalog, "../../private"), null);
    assert.throws(() => parseCatalog({ ok: true, releases: [release], downloadBaseUrl: "https://unexpected.example" }));
});

test("Mac architectures and newest actually available version are independent", () => {
    const arm = { ...windows, platform: "macos-arm64", filename: "Vibyra-arm64.dmg", version: "0.4.10" };
    const intel = { ...arm, platform: "macos-x64", version: "9.9.9", available: false };
    const catalog = parseCatalog({ ok: true, releases: [windows, { platform: "macos", variants: [arm, intel] }] });
    assert.equal(catalog.latest, "0.4.10");
    assert.equal(fileUrl(catalog, "macos-arm64"), "/downloads/macos-arm64");
    assert.equal(fileUrl(catalog, "macos-x64"), null);
});

test("malformed and duplicate catalogues fail visibly", () => {
    for (const payload of [null, { releases: [] }, { ok: true, releases: [] }, { ok: true, releases: [windows, windows] }]) {
        assert.throws(() => parseCatalog(payload));
    }
});

test("Linux installation commands use the actual filename and exclude shell syntax", () => {
    const deb = { ...windows, platform: "linux-deb", filename: "Vibyra-0.4.3-amd64.deb" };
    assert.equal(installCommand(deb, "linux-deb"), "sudo apt install ~/Downloads/'Vibyra-0.4.3-amd64.deb'");
    for (const filename of ["$(command).deb", "../package.deb", "'unsafe'.deb"]) {
        assert.equal(installCommand({ ...deb, filename }, "linux-deb"), null);
    }
});
